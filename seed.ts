import { db } from "./prisma/db";
async function main() {
    await db.orm.public.User.create({
        id: "cuid_user_a",
        username: "user_a",
        email: "a@example.com",
    }).catch(() => {});
    await db.orm.public.User.create({
        id: "cuid_user_b",
        username: "user_b",
        email: "b@example.com",
    }).catch(() => {});
    console.log("Users seeded");
}
main();
