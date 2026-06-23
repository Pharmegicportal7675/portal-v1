const { PrismaClient } = require('../generated/prisma');

async function testConnection() {
  console.log('Initializing Prisma Client...');
  const prisma = new PrismaClient();
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    
    console.log('Fetching certificates...');
    const certificates = await prisma.certificates.findMany({
      take: 5,
      select: {
        id: true,
        certificate_number: true,
        client_id: true,
        chemical_id: true,
        type: true,
        status: true
      }
    });
    console.log('Certificates list:', certificates);
  } catch (error) {
    console.error('Error connecting to database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
