import sqlite3
conn = sqlite3.connect('app/mailpilot.db')
cursor = conn.cursor()

# Drop the unique constraint on task_hash that causes IntegrityError for multi-user
try:
    cursor.execute("DROP INDEX IF EXISTS ix_tasks_task_hash")
    cursor.execute("CREATE INDEX ix_tasks_task_hash ON tasks (task_hash)")
    conn.commit()
    print("Converted task_hash from UNIQUE to regular index")
except Exception as e:
    print(f"Error: {e}")

# Verify
cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='tasks'")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]}")

conn.close()
print("Done!")
