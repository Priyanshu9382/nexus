import { db } from "./prisma/db";
const orm: any = db.orm;
console.log(Object.keys(orm));
