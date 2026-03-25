const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '36.138.73.49',
  port: 3377,
  user: 'xiulian',
  password: 'Xai8tbSKn8cEcYTn',
  database: 'xiulian',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: '+08:00'
});

async function initDb() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS meditations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      date DATE NOT NULL,
      duration_minutes INT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS worldly_thoughts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      date DATE NOT NULL,
      cause VARCHAR(500) NOT NULL,
      content TEXT NOT NULL,
      trajectory TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      date DATE NOT NULL,
      wake_time VARCHAR(10),
      sleep_time VARCHAR(10),
      wake_remark TEXT,
      sleep_remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_user_date (user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS insights (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('MySQL 数据库表初始化完成');
}

// Helper: query returns rows array
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Helper: execute INSERT/UPDATE/DELETE, returns result with insertId, affectedRows
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

module.exports = { pool, initDb, query, execute };
