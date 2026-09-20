import fs from "fs/promises";

interface Seat {
  id: number;
  room_id: number;
  row_label: string;
  seat_number: number;
  seat_type: "standard" | "vip";
}

interface Showtime {
  id: number;
  movie_id: number;
  room_id: number;
  starts_at: string;
  ends_at: string;
  price: number;
  created_at: string;
}

interface Reservation {
  id: number;
  user_id: number;
  showtime_id: number;
  reserved_at: string;
  party_size: number;
  status: "confirmed" | "completed" | "cancelled";
  total_amount: number;
  created_at: string;
}

interface Ticket {
  id: number;
  reservation_id: number;
  showtime_id: number;
  seat_id: number;
  price: number;
  status: "confirmed" | "used" | "cancelled";
  created_at: string;
}

async function loadJson<T>(file: string): Promise<T> {
  const content = await fs.readFile(
    file,
    "utf-8"
  );

  return JSON.parse(content) as T;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [result[i], result[j]] = [
      result[j],
      result[i],
    ];
  }

  return result;
}

function findAdjacentSeats(
  seats: Seat[],
  count: number
): Seat[] | null {

  const rows = new Map<
    string,
    Seat[]
  >();

  for (const seat of seats) {
    const row =
      rows.get(seat.row_label) ?? [];

    row.push(seat);

    rows.set(
      seat.row_label,
      row
    );
  }

  for (const row of rows.values()) {
    row.sort(
      (a, b) =>
        a.seat_number -
        b.seat_number
    );
  }

  for (const row of rows.values()) {
    if (row.length < count) {
      continue;
    }

    for (
      let start = 0;
      start <= row.length - count;
      start++
    ) {
      const group =
        row.slice(
          start,
          start + count
        );

      let adjacent = true;

      for (
        let i = 1;
        i < group.length;
        i++
      ) {
        if (
          group[i].seat_number !==
          group[i - 1].seat_number + 1
        ) {
          adjacent = false;
          break;
        }
      }

      if (adjacent) {
        return group;
      }
    }
  }

  return null;
}

function selectSeats(
  availableSeats: Seat[],
  count: number
): Seat[] {
  if (
    availableSeats.length < count
  ) {
    throw new Error(
      `Not enough seats available. Needed ${count}, but only ${availableSeats.length} remain.`
    );
  }

  if (Math.random() < 0.8) {
    const adjacent =
      findAdjacentSeats(
        availableSeats,
        count
      );

    if (adjacent) {
      return adjacent;
    }
  }

  return shuffle(
    availableSeats
  ).slice(0, count);
}

function getTicketStatus(
  reservation: Reservation
): Ticket["status"] {
  switch (reservation.status) {
    case "completed":
      return "used";

    case "cancelled":
      return "cancelled";

    case "confirmed":
      return "confirmed";
  }
}

async function generateTickets() {
  console.log(
    "Loading seats, showtimes and reservations..."
  );

  const seats =
    await loadJson<Seat[]>(
      "data/seats.json"
    );

  const showtimes =
    await loadJson<Showtime[]>(
      "data/showtimes.json"
    );

  const reservations =
    await loadJson<Reservation[]>(
      "data/reservations.json"
    );

  console.log(
    `Seats: ${seats.length}`
  );
  console.log(
    `Showtimes: ${showtimes.length}`
  );
  console.log(
    `Reservations: ${reservations.length}`
  );

  const showtimeMap = new Map<
    number,
    Showtime
  >();

  for (const showtime of showtimes) {
    showtimeMap.set(
      showtime.id,
      showtime
    );
  }

  const seatsByRoom = new Map<
    number,
    Seat[]
  >();

  for (const seat of seats) {
    const roomSeats =
      seatsByRoom.get(
        seat.room_id
      ) ?? [];

    roomSeats.push(seat);

    seatsByRoom.set(
      seat.room_id,
      roomSeats
    );
  }

  /*
   * -----------------------------------------
   * Track booked seats
   * -----------------------------------------
   *
   * A seat can be used again in another
   * showtime.
   *
   * But it cannot be booked twice for
   * the SAME showtime.
   *
   * Example:
   *
   * "421-37"
   *
   * means:
   *
   * showtime 421
   * seat 37
   */

  const bookedSeats =
    new Set<string>();

  const tickets: Ticket[] = [];

  for (const reservation of reservations) {
    const showtime =
      showtimeMap.get(
        reservation.showtime_id
      );

    if (!showtime) {
      throw new Error(
        `Reservation ${reservation.id} references missing showtime ${reservation.showtime_id}.`
      );
    }

    const roomSeats =
      seatsByRoom.get(
        showtime.room_id
      );

    if (!roomSeats) {
      throw new Error(
        `Showtime ${showtime.id} references room ${showtime.room_id}, but that room has no seats.`
      );
    }

    if (
      reservation.status ===
      "cancelled"
    ) {
      const randomSeats =
        shuffle(roomSeats).slice(
          0,
          reservation.party_size
        );

      for (const seat of randomSeats) {
        tickets.push({
          id: tickets.length + 1,
          reservation_id:
            reservation.id,
          showtime_id:
            reservation.showtime_id,

          seat_id: seat.id,
          price: showtime.price,
          status: "cancelled",
          created_at:
            reservation.created_at,
        });
      }

      continue;
    }

    const availableSeats =
      roomSeats.filter((seat) => {
        const key =
          `${showtime.id}-${seat.id}`;

        return !bookedSeats.has(key);
      });

    if (
      availableSeats.length <
      reservation.party_size
    ) {
      throw new Error(
        `Not enough seats for reservation ${reservation.id}.`
      );
    }

    const selectedSeats =
      selectSeats(
        availableSeats,
        reservation.party_size
      );

    for (const seat of selectedSeats) {
      const key =
        `${showtime.id}-${seat.id}`;

      if (bookedSeats.has(key)) {
        throw new Error(
          `Seat ${seat.id} was already booked for showtime ${showtime.id}.`
        );
      }

      bookedSeats.add(key);

      tickets.push({
        id: tickets.length + 1,

        reservation_id:
          reservation.id,

        showtime_id:
          reservation.showtime_id,

        seat_id: seat.id,

        price: showtime.price,

        status:
          getTicketStatus(
            reservation
          ),

        created_at:
          reservation.created_at,
      });
    }
  }

  await fs.writeFile(
    "data/tickets.json",
    JSON.stringify(
      tickets,
      null,
      2
    ),
    "utf-8"
  );

  const nonCancelledReservations =
    reservations.filter(
      (reservation) =>
        reservation.status !==
        "cancelled"
    );

  const expectedActiveTickets =
    nonCancelledReservations.reduce(
      (sum, reservation) =>
        sum + reservation.party_size,
      0
    );

  const actualActiveTickets =
    tickets.filter(
      (ticket) =>
        ticket.status !== "cancelled"
    ).length;

  if (
    expectedActiveTickets !==
    actualActiveTickets
  ) {
    throw new Error(
      `Ticket validation failed. Expected ${expectedActiveTickets} active tickets but generated ${actualActiveTickets}.`
    );
  }

  const ticketKeys = new Set<string>();

  for (const ticket of tickets) {
    if (
      ticket.status ===
      "cancelled"
    ) {
      continue;
    }

    const key =
      `${ticket.showtime_id}-${ticket.seat_id}`;

    if (ticketKeys.has(key)) {
      throw new Error(
        `Duplicate active ticket found: ${key}`
      );
    }

    ticketKeys.add(key);
  }

  const statusCounts = {
    confirmed: 0,
    used: 0,
    cancelled: 0,
  };

  for (const ticket of tickets) {
    statusCounts[ticket.status]++;
  }

  console.log("");
  console.log(
    `Generated ${tickets.length} tickets`
  );
  console.log(
    `Confirmed tickets: ${statusCounts.confirmed}`
  );
  console.log(
    `Used tickets: ${statusCounts.used}`
  );
  console.log(
    `Cancelled tickets: ${statusCounts.cancelled}`
  );

  console.log("");
  console.log(
    "Ticket validation passed."
  );
  console.log(
    "No active seat is duplicated for a showtime."
  );
  console.log(
    "Saved to tickets.json"
  );
}

generateTickets().catch((error) => {
  console.error(
    "Failed to generate tickets:",
    error
  );

  process.exit(1);
});