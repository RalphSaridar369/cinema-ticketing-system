import { randomUUID } from "crypto";
import fs from "fs/promises";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  password: string;
  date_of_birth: string;
  gender: "male" | "female";
  city: string;
  created_at: string;
  last_login_at: string | null;
  is_active: boolean;
}

interface Showtime {
  id: string;
  movie_id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  price: number;
  created_at: string;
}

interface Room {
  id: string;
  branch_id: string;
  name: string;
  capacity: number;
  room_type: "standard" | "vip" | "imax";
  screen_type: "2D" | "3D" | "IMAX";
}

interface Reservation {
  id: string;
  user_id: string;
  showtime_id: string;
  reserved_at: string;
  party_size: number;
  status: "confirmed" | "completed" | "cancelled";
  total_amount: number;
  created_at: string;
}

const RESERVATION_COUNT = 10_000;

async function loadJson<T>(file: string): Promise<T> {
  const content = await fs.readFile(file, "utf-8");
  return JSON.parse(content) as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function weightedRandom<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];

    if (random <= 0) {
      return items[i];
    }
  }

  return items[items.length - 1];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function getStatus(showtime: Showtime): Reservation["status"] {
  const now = new Date();
  const startsAt = new Date(showtime.starts_at);

  if (startsAt < now) {
    const random = Math.random();

    if (random < 0.9) {
      return "completed";
    }

    return "cancelled";
  }

  const random = Math.random();

  if (random < 0.85) {
    return "confirmed";
  }

  return "cancelled";
}

function getPartySize(): number {
  const random = Math.random();

  if (random < 0.35) {
    return 1;
  }

  if (random < 0.7) {
    return 2;
  }

  if (random < 0.88) {
    return 3;
  }

  if (random < 0.96) {
    return 4;
  }

  if (random < 0.99) {
    return 5;
  }

  return 6;
}

async function generateReservations() {
  console.log("Loading data...");

  const users = await loadJson<User[]>("data/users.json");
  const showtimes = await loadJson<Showtime[]>("data/showtimes.json");
  const rooms = await loadJson<Room[]>("data/rooms.json");

  console.log(`Users loaded: ${users.length}`);
  console.log(`Showtimes loaded: ${showtimes.length}`);
  console.log(`Rooms loaded: ${rooms.length}`);

  if (users.length === 0) {
    throw new Error("No users found.");
  }

  if (showtimes.length === 0) {
    throw new Error("No showtimes found.");
  }

  const roomMap = new Map<string, Room>();

  for (const room of rooms) {
    roomMap.set(room.id, room);
  }

  const activeUsers = users.filter((user) => user.is_active);

  if (activeUsers.length === 0) {
    throw new Error("No active users found.");
  }

  const userWeights = activeUsers.map(() => {
    const random = Math.random();

    if (random < 0.1) {
      return 5;
    }

    if (random < 0.35) {
      return 3;
    }

    if (random < 0.75) {
      return 1.5;
    }

    return 0.5;
  });

  const showtimeWeights = showtimes.map((showtime) => {
    const hour = new Date(showtime.starts_at).getHours();

    let weight = 1;

    if (hour >= 18 && hour <= 21) {
      weight *= 2.5;
    }

    if (hour >= 22) {
      weight *= 0.7;
    }

    const day = new Date(showtime.starts_at).getDay();

    if (day === 5 || day === 6) {
      weight *= 1.8;
    }

    return weight;
  });

  const reservations: Reservation[] = [];
  const existingReservations = new Set<string>();

  let attempts = 0;

  const maxAttempts = RESERVATION_COUNT * 50;
  while (reservations.length < RESERVATION_COUNT && attempts < maxAttempts) {
    attempts++;

    const user = weightedRandom(activeUsers, userWeights);
    const showtime = weightedRandom(showtimes, showtimeWeights);
    const reservationKey = `${user.id}-${showtime.id}`;

    if (existingReservations.has(reservationKey)) {
      continue;
    }

    const userCreatedAt = new Date(user.created_at);
    const showtimeStart = new Date(showtime.starts_at);

    if (showtimeStart <= userCreatedAt) {
      continue;
    }

    const room = roomMap.get(showtime.room_id);

    if (!room) {
      continue;
    }

    const partySize = Math.min(getPartySize(), 6, room.capacity);
    const earliestReservation = new Date(
      Math.max(
        userCreatedAt.getTime(),
        showtimeStart.getTime() - 14 * 24 * 60 * 60 * 1000
      )
    );

    const latestReservation = new Date(
      showtimeStart.getTime() - 30 * 60 * 1000
    );

    if (earliestReservation >= latestReservation) {
      continue;
    }

    const reservedAt = randomDate(earliestReservation, latestReservation);
    const status = getStatus(showtime);
    const totalAmount = partySize * showtime.price;

    const reservation: Reservation = {
      id: randomUUID(),
      user_id: user.id,
      showtime_id: showtime.id,
      reserved_at: reservedAt.toISOString(),
      party_size: partySize,
      status,
      total_amount: totalAmount,
      created_at: reservedAt.toISOString(),
    };

    reservations.push(reservation);

    existingReservations.add(reservationKey);
  }

  if (reservations.length < RESERVATION_COUNT) {
    throw new Error(
      `Could only generate ${reservations.length} reservations after ${attempts} attempts.`
    );
  }

  reservations.sort(
    (a, b) =>
      new Date(a.reserved_at).getTime() - new Date(b.reserved_at).getTime()
  );

  reservations.forEach((reservation, index) => {
    reservation.id = randomUUID();
  });

  await fs.writeFile(
    "data/reservations.json",
    JSON.stringify(reservations, null, 2),
    "utf-8"
  );

  const statusCounts = {
    confirmed: 0,
    completed: 0,
    cancelled: 0,
  };

  let totalTickets = 0;
  let totalRevenue = 0;

  for (const reservation of reservations) {
    statusCounts[reservation.status]++;

    totalTickets += reservation.party_size;

    if (reservation.status !== "cancelled") {
      totalRevenue += reservation.total_amount;
    }
  }

  const uniqueUsers = new Set(
    reservations.map((reservation) => reservation.user_id)
  );

  console.log("");
  console.log(`Generated ${reservations.length} reservations`);
  console.log(
    `Users with reservations: ${uniqueUsers.size}/${activeUsers.length}`
  );
  console.log(`Estimated tickets: ${totalTickets}`);

  console.log(`Confirmed: ${statusCounts.confirmed}`);
  console.log(`Completed: ${statusCounts.completed}`);
  console.log(`Cancelled: ${statusCounts.cancelled}`);

  console.log(
    `Revenue from non-cancelled reservations: $${totalRevenue.toFixed(2)}`
  );

  console.log("");

  console.log("Saved to reservations.json");
}

generateReservations().catch((error) => {
  console.error("Failed to generate reservations:", error);

  process.exit(1);
});
