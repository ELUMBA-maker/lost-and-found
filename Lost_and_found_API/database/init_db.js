import query from "pg/lib/native/query";
import pool from "../src/db.js";
const createTables = async () => {
  try {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS users(
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
               password_hash TEXT NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
    await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';`);
    await pool.query(`
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
                            ) THEN
                                ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
                            END IF;
                        END $$;`);
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
                        ALTER TABLE claims
                        ADD COLUMN IF NOT EXISTS evidence_data TEXT,
                        ADD COLUMN IF NOT EXISTS evidence_name VARCHAR(255),
                        ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
                        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_requested',
                        ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10, 2),
                        ADD COLUMN IF NOT EXISTS payment_instructions TEXT,
                        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
                        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;`);
    await pool.query(`
                        DO $$
                        BEGIN
                            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_verification_status_check') THEN
                                ALTER TABLE claims ADD CONSTRAINT claims_verification_status_check
                                CHECK (verification_status IN ('pending', 'verified', 'rejected'));
                            END IF;
                            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_payment_status_check') THEN
                                ALTER TABLE claims ADD CONSTRAINT claims_payment_status_check
                                CHECK (payment_status IN ('not_requested', 'requested', 'paid'));
                            END IF;
                        END $$;`);
    await pool.query(`
                        CREATE TABLE IF NOT EXISTS claim_messages (
                            id SERIAL PRIMARY KEY,
                            claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
                            sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            message TEXT NOT NULL,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        );`);
    await pool.query(`
                        CREATE INDEX IF NOT EXISTS idx_claim_messages_claim_id
                        ON claim_messages(claim_id, created_at);`);
    await pool.query(`
            ALTER TABLE items ADD COLUMN IF NOT EXISTS image_data TEXT;`);
    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);`);
    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);`);
    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_items_location ON items(location);`);
    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);`);
    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_claims_item_id ON claims(item_id);`);
  } catch (error) {
    console.error("Database Initialization Failed", error);
    throw error;
  }
};
export default createTables;
