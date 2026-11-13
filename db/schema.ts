import { sqliteTable,text,integer } from 'drizzle-orm/sqlite-core';
export const training=sqliteTable('training',{profile:text('profile').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
