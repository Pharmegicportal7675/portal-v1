import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  const apps = await prisma.tcc_applications.findMany({
    where: {
      OR: [
        { chemicals: { chemical_name: { contains: 'TT 1' } } },
        { chemicals: { cas_number: { contains: '12345' } } },
        { clients: { company_name: { contains: 'Letvar' } } },
      ],
    },
    select: {
      id: true,
      status: true,
      quantity_mt: true,
      export_date: true,
      updated_at: true,
      created_at: true,
      clients: { select: { company_name: true } },
      chemicals: { select: { chemical_name: true, cas_number: true } },
      certificates_certificates_tcc_application_idTotcc_applications: {
        select: { id: true, certificate_number: true, status: true },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 10,
  });
  console.log(JSON.stringify(apps, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
