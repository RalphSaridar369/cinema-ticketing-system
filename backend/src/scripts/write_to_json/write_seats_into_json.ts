import { randomUUID } from "crypto";
import fs from "fs/promises";

interface Room {
  id: string;
  branch_id: string;
  name: string;
  capacity: number;
  room_type: "standard" | "vip" | "imax";
  screen_type: "2D" | "3D" | "IMAX";
}

interface Seat {
  id: string;
  room_id: string;
  row_label: string;
  seat_number: number;
  seat_type: "standard" | "vip";
}

async function loadJson<T>(file: string): Promise<T> {
  const content = await fs.readFile(file, "utf-8");
  return JSON.parse(content) as T;
}

function generateSeatsForRoom(
  room: Room,
  startingSeatId: number
): Seat[] {
  const seats: Seat[] = [];

  /*
   * We'll use 10 seats per row.
   *
   * Example:
   *
   * A1 A2 A3 A4 A5 A6 A7 A8 A9 A10
   * B1 B2 B3 B4 B5 B6 B7 B8 B9 B10
   * C1 C2 C3 C4 C5 C6 C7 C8 C9 C10
   */

  const seatsPerRow = 10;

  const rowCount = Math.ceil(
    room.capacity / seatsPerRow
  );

  let seatId = startingSeatId;

  for (
    let rowIndex = 0;
    rowIndex < rowCount;
    rowIndex++
  ) {
    const rowLabel =
      String.fromCharCode(65 + rowIndex);

    const seatsRemaining =
      room.capacity -
      rowIndex * seatsPerRow;

    const seatsInRow = Math.min(
      seatsPerRow,
      seatsRemaining
    );

    for (
      let seatNumber = 1;
      seatNumber <= seatsInRow;
      seatNumber++
    ) {
      seats.push({
        id: randomUUID(),
        room_id: room.id,
        row_label: rowLabel,
        seat_number: seatNumber,
        seat_type:
          room.room_type === "vip"
            ? "vip"
            : "standard",
      });

      seatId++;
    }
  }

  return seats;
}

async function generateSeats() {
  console.log("Loading rooms...");

  const rooms =
    await loadJson<Room[]>("data/rooms.json");

  if (rooms.length === 0) {
    throw new Error(
      "rooms.json contains no rooms."
    );
  }
  console.log(
    `Found ${rooms.length} rooms.`
  );

  const seats: Seat[] = [];

  let nextSeatId = 1;

  for (const room of rooms) {
    const roomSeats =
      generateSeatsForRoom(
        room,
        nextSeatId
      );

    seats.push(...roomSeats);
    nextSeatId += roomSeats.length;

    console.log(
      `Room ${room.id}: ${roomSeats.length} seats`
    );
  }

  await fs.writeFile(
    "data/seats.json",
    JSON.stringify(
      seats,
      null,
      2
    ),
    "utf-8"
  );

  for (const room of rooms) {
    const roomSeatCount =
      seats.filter(
        (seat) =>
          seat.room_id === room.id
      ).length;

    if (
      roomSeatCount !== room.capacity
    ) {
      throw new Error(
        `Room ${room.id} expected ${room.capacity} seats but generated ${roomSeatCount}.`
      );
    }
  }

  console.log("");
  console.log(
    `Generated ${seats.length} seats.`
  );
  console.log(
    "Capacity validation passed."
  );
  console.log(
    "Saved to seats.json"
  );
}

generateSeats().catch((error) => {
  console.error(
    "Failed to generate seats:",
    error
  );

  process.exit(1);
});