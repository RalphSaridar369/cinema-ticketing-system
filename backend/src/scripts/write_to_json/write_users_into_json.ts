import fs from "fs/promises";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

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

const USER_COUNT = 400;
const BCRYPT_ROUNDS = 10;

const DEFAULT_PASSWORD = "Cinema123!";

const maleFirstNames = [
  "Ralph", "Karim", "Joseph", "Anthony", "Elias",
  "Charbel", "Fadi", "Tony", "George", "Michel",
  "Nicolas", "Jean", "Jad", "Marc", "Sami",
  "Tarek", "Hadi", "Omar", "Ali", "Hassan",
  "Bassam", "Elie", "Patrick", "Raymond", "Rami",
  "Samir", "Walid", "Wissam", "Roger", "Naji",
];

const femaleFirstNames = [
  "Maya", "Sarah", "Lara", "Nour", "Mira",
  "Lynn", "Jessica", "Christelle", "Cynthia", "Maria",
  "Joelle", "Carla", "Karen", "Diana", "Rita",
  "Nancy", "Stephanie", "Yara", "Lea", "Nadine",
  "Rania", "Dana", "Jana", "Tala", "Maya",
  "Nicole", "Celine", "Gabrielle", "Samar", "Layla",
];

const lastNames = [
  "Haddad",
  "Khoury",
  "Nassar",
  "Mansour",
  "Saad",
  "Hanna",
  "Karam",
  "Fares",
  "Khalil",
  "Moussa",
  "Saba",
  "Saliba",
  "Rizk",
  "Maalouf",
  "Bitar",
  "Awad",
  "Farah",
  "Antoun",
  "Doumet",
  "Dagher",
  "Abou Daher",
  "Younes",
  "Nasr",
  "Harb",
  "Assaf",
  "Tannous",
  "Gerges",
  "Zein",
  "Matar",
  "Saade",
  "Mrad",
  "Beydoun",
  "Hobeika",
  "Karam",
  "Sarkis",
  "Chami",
  "Khoury",
  "Daher",
  "Rahme",
  "Azar",
];

const cities = [
  "Beirut",
  "Jounieh",
  "Tripoli",
  "Byblos",
  "Baalbek",
  "Zahle",
  "Sidon",
  "Tyre",
  "Aley",
  "Batroun",
  "Dora",
  "Antelias",
  "Broummana",
  "Hazmieh",
  "Chouf",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() +
      Math.random() * (end.getTime() - start.getTime())
  );
}

function generateDateOfBirth(): string {
  const now = new Date();

  const youngest = new Date(
    now.getFullYear() - 18,
    now.getMonth(),
    now.getDate()
  );

  const oldest = new Date(
    now.getFullYear() - 65,
    now.getMonth(),
    now.getDate()
  );

  return randomDate(oldest, youngest)
    .toISOString()
    .split("T")[0];
}

function generateLebanesePhone(
  usedPhones: Set<string>
): string {
  const prefixes = [
    "3",
    "70",
    "71",
    "76",
    "78",
    "79",
    "81",
  ];

  while (true) {
    const prefix = randomItem(prefixes);

    const digits = Array.from(
      { length: 6 },
      () => randomInt(0, 9)
    ).join("");

    const phone = `+961 ${prefix} ${digits.slice(
      0,
      3
    )} ${digits.slice(3)}`;

    if (!usedPhones.has(phone)) {
      usedPhones.add(phone);
      return phone;
    }
  }
}

function cleanName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z]/g, "");
}

function generateEmail(
  firstName: string,
  lastName: string,
  id: number
): string {
  return `${cleanName(firstName)}.${cleanName(
    lastName
  )}${id}@cinemadb.test`;
}

async function generateUsers(): Promise<User[]> {
  console.log("Generating users...");

  console.log(
    `Hashing password with bcrypt (${BCRYPT_ROUNDS} rounds)...`
  );

  const passwordHash = await bcrypt.hash(
    DEFAULT_PASSWORD,
    BCRYPT_ROUNDS
  );

  const users: User[] = [];

  const usedPhones = new Set<string>();

  const registrationStart = new Date();
  registrationStart.setMonth(
    registrationStart.getMonth() - 12
  );

  const now = new Date();

  for (let id = 1; id <= USER_COUNT; id++) {
    const gender: "male" | "female" =
      Math.random() < 0.5
        ? "male"
        : "female";

    const firstName =
      gender === "male"
        ? randomItem(maleFirstNames)
        : randomItem(femaleFirstNames);

    const lastName = randomItem(lastNames);

    const createdAt = randomDate(
      registrationStart,
      now
    );


    const hasLoggedIn = Math.random() < 0.9;

    const lastLoginAt = hasLoggedIn
      ? randomDate(createdAt, now).toISOString()
      : null;

    const isActive = Math.random() < 0.95;

    users.push({
      id:randomUUID(),
      first_name: firstName,
      last_name: lastName,
      phone: generateLebanesePhone(
        usedPhones
      ),

      email: generateEmail(
        firstName,
        lastName,
        id
      ),

      password: passwordHash,
      date_of_birth: generateDateOfBirth(),
      gender,
      city: randomItem(cities),
      created_at: createdAt.toISOString(),
      last_login_at: lastLoginAt,
      is_active: isActive,
    });
  }

  await fs.writeFile(
    "data/users.json",
    JSON.stringify(users, null, 2),
    "utf-8"
  );

  console.log("");
  console.log(
    `Finished! Generated ${users.length} users.`
  );

  console.log("Saved to users.json");

  console.log("");
  console.log(
    `Development password for all users: ${DEFAULT_PASSWORD}`
  );

  return users;
}

generateUsers().catch((error) => {
  console.error(
    "Failed to generate users:",
    error
  );

  process.exit(1);
});