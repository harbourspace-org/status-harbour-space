import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main(): Promise<void> {
  const rows = await sql`
    SELECT id, region, last_seen_at, NOW() - last_seen_at AS age
    FROM agents
    ORDER BY last_seen_at DESC NULLS LAST
  `;
  for (const r of rows) {
    console.log(
      `${String(r.id).padEnd(16)} region=${String(r.region).padEnd(10)} last_seen=${r.last_seen_at}  age=${r.age}`,
    );
  }
  await sql.end();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
