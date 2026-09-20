import fs from "fs/promises";

interface Branch {
  id: number;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  phone: string;
  created_at: string;
}

interface Room {
  id: number;
  branch_id: number;
  name: string;
  capacity: number;
  room_type: "standard" | "vip" | "imax";
  screen_type: "2D" | "3D" | "IMAX";
  created_at: string;
}

async function generateCinemaData(): Promise<{
  branches: Branch[];
  rooms: Room[];
}> {
  const createdAt = new Date().toISOString();

  const branches: Branch[] = [
    {
      id: 1,
      name: "CineMax Downtown",
      address: "Downtown Beirut",
      city: "Beirut",
      latitude: 33.8959,
      longitude: 35.4784,
      phone: "+961 1 100 001",
      created_at: createdAt,
    },
    {
      id: 2,
      name: "CineMax Achrafieh",
      address: "Achrafieh",
      city: "Beirut",
      latitude: 33.8894,
      longitude: 35.516,
      phone: "+961 1 100 002",
      created_at: createdAt,
    },
    {
      id: 3,
      name: "CineMax Hamra",
      address: "Hamra",
      city: "Beirut",
      latitude: 33.895,
      longitude: 35.484,
      phone: "+961 1 100 003",
      created_at: createdAt,
    },
    {
      id: 4,
      name: "CineMax Jounieh",
      address: "Jounieh",
      city: "Jounieh",
      latitude: 33.9808,
      longitude: 35.6178,
      phone: "+961 9 100 004",
      created_at: createdAt,
    },
    {
      id: 5,
      name: "CineMax Tripoli",
      address: "Tripoli",
      city: "Tripoli",
      latitude: 34.4367,
      longitude: 35.8497,
      phone: "+961 6 100 005",
      created_at: createdAt,
    },
  ];

  const rooms: Room[] = [];

  const roomTypes: Room["room_type"][] = [
    "standard",
    "standard",
    "standard",
    "vip",
    "imax",
  ];

  for (const branch of branches) {
    for (let roomNumber = 1; roomNumber <= 16; roomNumber++) {
      const roomType =
        roomTypes[(roomNumber - 1) % roomTypes.length];

      let capacity: number;
      let screenType: Room["screen_type"];

      switch (roomType) {
        case "vip":
          capacity = 80;
          screenType = "2D";
          break;

        case "imax":
          capacity = 250;
          screenType = "IMAX";
          break;

        default:
          capacity = 150 + (roomNumber % 4) * 10;
          screenType = roomNumber % 3 === 0 ? "3D" : "2D";
          break;
      }

      rooms.push({
        id: (branch.id - 1) * 16 + roomNumber,
        branch_id: branch.id,
        name: `Room ${roomNumber}`,
        capacity,
        room_type: roomType,
        screen_type: screenType,
        created_at: createdAt,
      });
    }
  }

  await fs.writeFile(
    "data/branches.json",
    JSON.stringify(branches, null, 2),
    "utf-8"
  );

  await fs.writeFile(
    "data/rooms.json",
    JSON.stringify(rooms, null, 2),
    "utf-8"
  );

  console.log(`Created ${branches.length} branches.`);
  console.log(`Created ${rooms.length} rooms.`);

  return {
    branches,
    rooms,
  };
}

// Run the generator
generateCinemaData().catch((error) => {
  console.error("Failed to generate cinema data:", error);
  process.exit(1);
});