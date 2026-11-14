const cenario = JSON.parse(process.env.R2_TESTE_CENARIO);
const args = process.argv.slice(2);
if (args[0] === 'deployments' && args[1] === 'list') {
  process.stdout.write(JSON.stringify([{ created_on: '2026-01-01T00:00:00Z', versions: [{ version_id: 'v1', percentage: 100 }] }]));
} else if (args[0] === 'versions' && args[1] === 'view' && args[2] === 'v1') {
  const bindings = [
    { name: 'UPLOADS', type: 'r2_bucket', bucket_name: cenario.bucket },
    { name: 'DEPLOY_ENV', type: 'plain_text', text: 'production' },
    { name: 'NEXT_PUBLIC_R2_PUBLIC_URL', type: 'plain_text', text: cenario.origem },
    ...(!cenario.semIdentidade ? [{ name: 'HYPERDRIVE', type: 'hyperdrive', id: 'hyper-id' }] : []),
  ];
  process.stdout.write(JSON.stringify({ id: 'v1', resources: { bindings } }));
} else {
  process.exitCode = 1;
}
