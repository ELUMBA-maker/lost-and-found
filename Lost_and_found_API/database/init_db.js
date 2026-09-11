import query from "pg/lib/native/query";
import pool from "../src/db.js"
const createTables =async() =>{
    try{
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users(
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
               password_hash TEXT NOT NULL,
    phone VARCHAR(30),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
            await pool.query(`

            CREATE TABLE IF NOT EXISTS items (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(150) NOT NULL,
            description TEXT NOT NULL,
            category VARCHAR(50) NOT NULL,
            location VARCHAR(150) NOT NULL,
            item_date DATE NOT NULL,
            status VARCHAR(20) NOT NULL CHECK (status IN ('lost', 'found', 'claimed', 'returned')),
            contact_phone VARCHAR(30),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
            await pool.query(`
            CREATE TABLE IF NOT EXISTS claims (
            id SERIAL PRIMARY KEY,
            item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            claimant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'approved', 'rejected')),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (item_id, claimant_id)
);`);
            await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);`)
            await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);`)
            await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_items_location ON items(location);`)
            await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);`)
            await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_claims_item_id ON claims(item_id);`)
}
catch(error){
    console.error("Database Initialization Failed", error)
    throw error
}
}
export default createTables
