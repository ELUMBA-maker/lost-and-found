import pool from "../db.js";

async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        phone VARCHAR(30),
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        verification_code VARCHAR(10),
        verification_expires TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        location VARCHAR(150) NOT NULL,
        item_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL
          CHECK (status IN ('lost', 'found', 'claimed', 'returned')),
        contact_phone VARCHAR(30),
        image_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS claims (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        claimant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (
            status IN (
              'pending', 'pending_verification', 'pending_review',
              'approved', 'rejected', 'completed', 'cancelled'
            )
          ),
        evidence_data TEXT,
        evidence_name TEXT,
        verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (verification_status IN ('pending', 'verified', 'rejected')),
        payment_status VARCHAR(20) NOT NULL DEFAULT 'not_requested'
          CHECK (
            payment_status IN ('not_requested', 'requested', 'paid')
          ),
        payment_amount INTEGER,
        payment_instructions TEXT,
        verified_at TIMESTAMP,
        paid_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (item_id, claimant_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS claim_evidence (
        id SERIAL PRIMARY KEY,
        claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
        evidence_type VARCHAR(30) NOT NULL
          CHECK (evidence_type IN ('identity', 'ownership', 'other')),
        file_url TEXT NOT NULL,
        description TEXT,
        uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS claim_messages (
        id SERIAL PRIMARY KEY,
        claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        claim_id INTEGER UNIQUE NOT NULL
          REFERENCES claims(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL
          REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10),
        ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP;
    `);
    await pool.query(`
      ALTER TABLE items ADD COLUMN IF NOT EXISTS image_data TEXT;
    `);
    await pool.query(`
      ALTER TABLE claims
        ADD COLUMN IF NOT EXISTS evidence_data TEXT,
        ADD COLUMN IF NOT EXISTS evidence_name TEXT,
        ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_requested',
        ADD COLUMN IF NOT EXISTS payment_amount INTEGER,
        ADD COLUMN IF NOT EXISTS payment_instructions TEXT,
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
    `);
    await pool.query(`
      ALTER TABLE claims
        ALTER COLUMN status SET DEFAULT 'pending',
        DROP CONSTRAINT IF EXISTS claims_status_check,
        ADD CONSTRAINT claims_status_check
          CHECK (
            status IN (
              'pending', 'pending_verification', 'pending_review',
              'approved', 'rejected', 'completed', 'cancelled'
            )
          );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_items_location ON items(location);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_claims_item_id ON claims(item_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_claim_messages_claim_id
        ON claim_messages(claim_id);
    `);
  } catch (error) {
    console.error("Database Initialization Failed", error);
    throw error;
  }
}

export default createTables;
