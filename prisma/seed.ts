import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean up existing data
  await prisma.invoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.order.deleteMany();
  await prisma.call.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.reservationPolicy.deleteMany();
  await prisma.orderingPolicy.deleteMany();
  await prisma.notificationSettings.deleteMany();
  await prisma.phoneConfig.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();

  // ─── Users ───────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const owner = await prisma.user.create({
    data: {
      email: 'owner@tonys.com',
      passwordHash,
      firstName: 'Tony',
      lastName: 'Romano',
      role: 'OWNER',
      emailVerified: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@tonys.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Wilson',
      role: 'MANAGER',
      emailVerified: true,
    },
  });

  console.log('  ✅ Users created');

  // ─── Business ────────────────────────────────────────────────────────────
  const business = await prisma.business.create({
    data: {
      userId: owner.id,
      name: "Tony's Pizzeria",
      type: 'Pizza Restaurant',
      address: '42 Market Street, Manchester, M1 1PW',
      phone: '+44 161 234 5678',
      email: 'info@tonyspizzeria.co.uk',
      website: 'https://tonyspizzeria.co.uk',
      country: 'United Kingdom',
      currency: 'GBP',
      primaryLanguage: 'en',
      timezone: 'Europe/London',
      openingHours: {
        mon: '11:00 AM - 11:00 PM',
        tue: '11:00 AM - 11:00 PM',
        wed: '11:00 AM - 11:00 PM',
        thu: '11:00 AM - 11:00 PM',
        fri: '11:00 AM - 12:00 AM',
        sat: '11:00 AM - 12:00 AM',
        sun: '12:00 PM - 10:00 PM',
      },
      onboardingStep: 7,
      onboardingDone: true,
    },
  });

  console.log('  ✅ Business created');

  // ─── Agent ───────────────────────────────────────────────────────────────
  await prisma.agent.create({
    data: {
      businessId: business.id,
      name: 'Aria',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      voiceName: 'Aria (Rachel)',
      voiceDescription: 'Warm & professional',
      openingGreeting: "Thanks for calling Tony's Pizzeria! How can I help you today?",
      closingMessage: "Thank you for calling Tony's! Have a great day!",
      transferNumber: '+44 161 234 5679',
      transferEnabled: true,
      takeMessages: true,
      acceptOrders: true,
      takeReservations: true,
      answerAfterHours: true,
      isActive: true,
    },
  });

  console.log('  ✅ Agent created');

  // ─── Phone Config ────────────────────────────────────────────────────────
  await prisma.phoneConfig.create({
    data: { businessId: business.id, forwardNumber: '+44 161 234 5679', ringsBeforeAi: 0 },
  });

  // ─── Notification Settings ───────────────────────────────────────────────
  await prisma.notificationSettings.create({
    data: { businessId: business.id },
  });

  // ─── Ordering Policy ────────────────────────────────────────────────────
  await prisma.orderingPolicy.create({
    data: {
      businessId: business.id,
      deliveryEnabled: true,
      collectionEnabled: true,
      deliveryRadius: 5.0,
      deliveryRadiusUnit: 'miles',
      minOrderAmount: 10,
      payNowEnabled: true,
      payOnDelivery: true,
    },
  });

  // ─── Reservation Policy ─────────────────────────────────────────────────
  await prisma.reservationPolicy.create({
    data: {
      businessId: business.id,
      depositRequired: true,
      depositAmount: 10,
      depositType: 'PER_GUEST',
      maxPartySize: 20,
      bookingLeadTime: 2,
      cancellationHours: 24,
    },
  });

  console.log('  ✅ Policies created');

  // ─── Menu Categories & Items ─────────────────────────────────────────────
  const categories = [
    {
      name: 'Pizzas', sortOrder: 0, items: [
        { name: 'Margherita', description: 'Tomato, mozzarella, fresh basil', price: 9.99 },
        { name: 'Pepperoni', description: 'Tomato, mozzarella, pepperoni', price: 11.99 },
        { name: 'BBQ Chicken', description: 'BBQ sauce, chicken, red onion, mozzarella', price: 13.49 },
        { name: 'Quattro Formaggi', description: 'Mozzarella, gorgonzola, parmesan, goat cheese', price: 12.99 },
        { name: 'Hawaiian', description: 'Tomato, mozzarella, ham, pineapple', price: 11.49 },
      ],
    },
    {
      name: 'Pasta', sortOrder: 1, items: [
        { name: 'Spaghetti Bolognese', description: 'Classic meat sauce with spaghetti', price: 10.99 },
        { name: 'Carbonara', description: 'Pancetta, egg, parmesan, black pepper', price: 11.49 },
        { name: 'Penne Arrabbiata', description: 'Spicy tomato sauce with chilli', price: 9.49 },
      ],
    },
    {
      name: 'Sides', sortOrder: 2, items: [
        { name: 'Garlic Bread', description: 'With mozzarella', price: 4.99 },
        { name: 'Caesar Salad', description: 'Romaine, croutons, parmesan, Caesar dressing', price: 6.99 },
        { name: 'Mozzarella Sticks', description: 'With marinara dipping sauce', price: 5.49 },
        { name: 'Bruschetta', description: 'Tomato, basil, olive oil on toasted bread', price: 5.99 },
      ],
    },
    {
      name: 'Desserts', sortOrder: 3, items: [
        { name: 'Tiramisu', description: 'Classic Italian coffee dessert', price: 6.99 },
        { name: 'Panna Cotta', description: 'With berry compote', price: 5.99 },
        { name: 'Chocolate Fondant', description: 'With vanilla ice cream', price: 7.49 },
      ],
    },
    {
      name: 'Drinks', sortOrder: 4, items: [
        { name: 'Coca-Cola', description: '330ml can', price: 1.99 },
        { name: 'Sparkling Water', description: '500ml bottle', price: 1.49 },
        { name: 'House Red Wine', description: '175ml glass', price: 5.99 },
        { name: 'Peroni', description: '330ml bottle', price: 4.49 },
      ],
    },
    {
      name: 'Specials', sortOrder: 5, items: [
        { name: 'Truffle Pizza', description: 'Truffle oil, mushroom, mozzarella, rocket', price: 15.99 },
        { name: 'Lobster Linguine', description: 'Fresh lobster, cherry tomato, white wine', price: 18.99 },
      ],
    },
  ];

  for (const cat of categories) {
    const category = await prisma.menuCategory.create({
      data: { businessId: business.id, name: cat.name, sortOrder: cat.sortOrder },
    });
    for (const item of cat.items) {
      await prisma.menuItem.create({
        data: { categoryId: category.id, name: item.name, description: item.description, price: item.price },
      });
    }
  }

  console.log('  ✅ Menu created (6 categories, 22 items)');

  // ─── Calls ───────────────────────────────────────────────────────────────
  const callData = [
    { callerName: 'James K.', callerPhone: '+44 7700 900001', status: 'COMPLETED' as const, outcome: 'Order placed — Large Pepperoni + Garlic Bread', outcomeType: 'ORDER' as const, duration: 245, amount: 16.98 },
    { callerName: 'Emily R.', callerPhone: '+44 7700 900002', status: 'COMPLETED' as const, outcome: 'Table booked for 4 — Friday 7pm', outcomeType: 'RESERVATION' as const, duration: 180 },
    { callerName: null, callerPhone: '+44 7700 900003', status: 'MISSED' as const, outcome: null, outcomeType: 'MISSED' as const, duration: null },
    { callerName: 'David M.', callerPhone: '+44 7700 900004', status: 'COMPLETED' as const, outcome: 'Menu enquiry — asked about gluten-free options', outcomeType: 'ENQUIRY' as const, duration: 120 },
    { callerName: 'Sophie L.', callerPhone: '+44 7700 900005', status: 'COMPLETED' as const, outcome: 'Order placed — 2x Margherita, Caesar Salad', outcomeType: 'ORDER' as const, duration: 310, amount: 26.97 },
    { callerName: null, callerPhone: '+44 7700 900006', status: 'MISSED' as const, outcome: null, outcomeType: 'MISSED' as const, duration: null },
    { callerName: 'Michael T.', callerPhone: '+44 7700 900007', status: 'COMPLETED' as const, outcome: 'Reservation for 2 — Saturday 8pm', outcomeType: 'RESERVATION' as const, duration: 150 },
    { callerName: 'Lucy W.', callerPhone: '+44 7700 900008', status: 'COMPLETED' as const, outcome: 'Order placed — BBQ Chicken Pizza, Tiramisu, Peroni', outcomeType: 'ORDER' as const, duration: 280, amount: 23.97 },
    { callerName: 'Raj P.', callerPhone: '+44 7700 900009', status: 'COMPLETED' as const, outcome: 'Opening hours check', outcomeType: 'ENQUIRY' as const, duration: 60 },
    { callerName: 'Anna B.', callerPhone: '+44 7700 900010', status: 'COMPLETED' as const, outcome: 'Large collection order — office lunch', outcomeType: 'ORDER' as const, duration: 420, amount: 89.90 },
    { callerName: null, callerPhone: '+44 7700 900011', status: 'MISSED' as const, outcome: null, outcomeType: 'MISSED' as const, duration: null },
    { callerName: 'Chris H.', callerPhone: '+44 7700 900012', status: 'COMPLETED' as const, outcome: 'Birthday reservation for 12', outcomeType: 'RESERVATION' as const, duration: 200 },
    { callerName: 'Lisa G.', callerPhone: '+44 7700 900013', status: 'COMPLETED' as const, outcome: 'Delivery order — Hawaiian + Mozzarella Sticks', outcomeType: 'ORDER' as const, duration: 195, amount: 16.98 },
    { callerName: 'Tom F.', callerPhone: '+44 7700 900014', status: 'LIVE' as const, outcome: null, outcomeType: null, duration: null },
    { callerName: 'Hannah S.', callerPhone: '+44 7700 900015', status: 'COMPLETED' as const, outcome: 'Enquiry about vegan options', outcomeType: 'ENQUIRY' as const, duration: 90 },
  ];

  for (let i = 0; i < callData.length; i++) {
    const d = callData[i];
    const startedAt = new Date();
    startedAt.setHours(startedAt.getHours() - (callData.length - i));
    await prisma.call.create({
      data: {
        businessId: business.id,
        callerName: d.callerName,
        callerPhone: d.callerPhone,
        status: d.status,
        outcome: d.outcome,
        outcomeType: d.outcomeType,
        duration: d.duration,
        amount: d.amount || null,
        startedAt,
        endedAt: d.duration ? new Date(startedAt.getTime() + d.duration * 1000) : null,
      },
    });
  }

  console.log('  ✅ Calls created (15)');

  // ─── Orders ──────────────────────────────────────────────────────────────
  const orderData = [
    { customerName: 'James K.', items: 'Large Pepperoni, Garlic Bread', type: 'DELIVERY' as const, status: 'COMPLETED' as const, amount: 16.98 },
    { customerName: 'Sophie L.', items: '2x Margherita, Caesar Salad', type: 'DELIVERY' as const, status: 'COMPLETED' as const, amount: 26.97 },
    { customerName: 'Lucy W.', items: 'BBQ Chicken Pizza, Tiramisu, Peroni', type: 'DELIVERY' as const, status: 'PREPARING' as const, amount: 23.97 },
    { customerName: 'Anna B.', items: '5x Margherita, 3x Garlic Bread, 5x Coca-Cola', type: 'COLLECTION' as const, status: 'READY' as const, amount: 89.90 },
    { customerName: 'Lisa G.', items: 'Hawaiian Pizza, Mozzarella Sticks', type: 'DELIVERY' as const, status: 'PENDING' as const, amount: 16.98 },
    { customerName: 'Mark D.', items: 'Carbonara, Bruschetta, House Red Wine', type: 'COLLECTION' as const, status: 'CONFIRMED' as const, amount: 23.47 },
    { customerName: 'Jessica N.', items: 'Quattro Formaggi, Panna Cotta', type: 'DELIVERY' as const, status: 'COMPLETED' as const, amount: 18.98 },
    { customerName: 'Oliver R.', items: 'Truffle Pizza, Sparkling Water', type: 'COLLECTION' as const, status: 'CANCELLED' as const, amount: 17.48 },
    { customerName: 'Chloe T.', items: 'Spaghetti Bolognese, Chocolate Fondant, Peroni', type: 'DELIVERY' as const, status: 'COMPLETED' as const, amount: 22.97 },
    { customerName: 'Daniel W.', items: 'Pepperoni, Penne Arrabbiata', type: 'DELIVERY' as const, status: 'CONFIRMED' as const, amount: 21.48 },
  ];

  for (let i = 0; i < orderData.length; i++) {
    const d = orderData[i];
    const createdAt = new Date();
    createdAt.setHours(createdAt.getHours() - (orderData.length - i) * 2);
    await prisma.order.create({
      data: { businessId: business.id, customerName: d.customerName, items: d.items, type: d.type, status: d.status, amount: d.amount, createdAt },
    });
  }

  console.log('  ✅ Orders created (10)');

  // ─── Reservations ────────────────────────────────────────────────────────
  const now = new Date();
  const resData = [
    { guestName: 'Emily R.', guestPhone: '+44 7700 900002', guests: 4, daysOut: 1, status: 'CONFIRMED' as const },
    { guestName: 'Michael T.', guestPhone: '+44 7700 900007', guests: 2, daysOut: 2, status: 'CONFIRMED' as const },
    { guestName: 'Chris H.', guestPhone: '+44 7700 900012', guests: 12, daysOut: 5, status: 'PENDING' as const },
    { guestName: 'Grace K.', guestPhone: '+44 7700 900016', guests: 6, daysOut: 0, status: 'CONFIRMED' as const },
    { guestName: 'Nathan P.', guestPhone: '+44 7700 900017', guests: 3, daysOut: 3, status: 'CANCELLED' as const },
    { guestName: 'Olivia M.', guestPhone: '+44 7700 900018', guests: 2, daysOut: -1, status: 'COMPLETED' as const },
    { guestName: 'Ryan S.', guestPhone: '+44 7700 900019', guests: 8, daysOut: -2, status: 'NO_SHOW' as const },
    { guestName: 'Megan L.', guestPhone: '+44 7700 900020', guests: 4, daysOut: 7, status: 'PENDING' as const },
  ];

  for (const d of resData) {
    const dateTime = new Date(now);
    dateTime.setDate(dateTime.getDate() + d.daysOut);
    dateTime.setHours(19, 0, 0, 0);
    await prisma.reservation.create({
      data: { businessId: business.id, guestName: d.guestName, guestPhone: d.guestPhone, guests: d.guests, dateTime, status: d.status },
    });
  }

  console.log('  ✅ Reservations created (8)');

  // ─── Integrations ────────────────────────────────────────────────────────
  await prisma.integration.createMany({
    data: [
      { businessId: business.id, name: 'resOS', category: 'Reservations', status: 'CONNECTED', lastSynced: new Date() },
      { businessId: business.id, name: 'Square', category: 'Orders', status: 'CONNECTED', lastSynced: new Date() },
      { businessId: business.id, name: 'Clover', category: 'Orders', status: 'AVAILABLE' },
      { businessId: business.id, name: 'Square KDS', category: 'KDS', status: 'CONNECTED', lastSynced: new Date() },
      { businessId: business.id, name: 'Clover KDS', category: 'KDS', status: 'AVAILABLE' },
      { businessId: business.id, name: 'Fresh KDS', category: 'KDS', status: 'AVAILABLE' },
      { businessId: business.id, name: 'Resend', category: 'Notifications', status: 'CONNECTED', lastSynced: new Date() },
      { businessId: business.id, name: 'Stripe Connect', category: 'Payments', status: 'CONNECTED', lastSynced: new Date() },
      { businessId: business.id, name: 'Google OAuth', category: 'Authentication', status: 'CONNECTED', lastSynced: new Date() },
    ],
  });

  console.log('  ✅ Integrations created (9)');

  // ─── Subscription ───────────────────────────────────────────────────────
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const subscription = await prisma.subscription.create({
    data: {
      businessId: business.id,
      plan: 'GROWTH',
      status: 'TRIALING',
      trialEndsAt: trialEnd,
      currentPeriodEnd: trialEnd,
    },
  });

  // ─── Invoices ─────────────────────────────────────────────────────────────
  for (let i = 3; i >= 1; i--) {
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - i);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: 399,
        status: 'paid',
        paidAt: periodStart,
        periodStart,
        periodEnd,
      },
    });
  }

  console.log('  ✅ Subscription + 3 invoices created');
  console.log('\n✅ Seed complete!');
  console.log(`\n📧 Login credentials:`);
  console.log(`   Owner:   owner@tonys.com / Password123!`);
  console.log(`   Manager: manager@tonys.com / Password123!`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
