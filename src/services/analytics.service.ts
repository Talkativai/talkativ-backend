import prisma from '../config/db.js';

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────

export const getDashboardStats = async (businessId: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [callsToday, totalRevenue, completedCalls, missedCalls, ordersToday] = await Promise.all([
    prisma.call.count({ where: { businessId, createdAt: { gte: today } } }),
    prisma.order.aggregate({ where: { businessId, status: { not: 'CANCELLED' } }, _sum: { amount: true } }),
    prisma.call.count({ where: { businessId, status: 'COMPLETED', createdAt: { gte: today } } }),
    prisma.call.count({ where: { businessId, status: 'MISSED', createdAt: { gte: today } } }),
    prisma.order.count({ where: { businessId, createdAt: { gte: today } } }),
  ]);

  const totalCallsToday = completedCalls + missedCalls;
  const answerRate = totalCallsToday > 0 ? Math.round((completedCalls / totalCallsToday) * 100) : 100;

  // Avg call duration
  const avgDuration = await prisma.call.aggregate({
    where: { businessId, status: 'COMPLETED', duration: { not: null } },
    _avg: { duration: true },
  });

  return {
    callsToday,
    ordersToday,
    revenue: totalRevenue._sum.amount?.toString() || '0',
    answerRate,
    avgDuration: Math.round(avgDuration._avg.duration || 0),
  };
};

// ─── Call Stats ──────────────────────────────────────────────────────────────

export const getCallStats = async (businessId: string) => {
  const [total, answered, avgDuration, ordersTaken] = await Promise.all([
    prisma.call.count({ where: { businessId } }),
    prisma.call.count({ where: { businessId, status: 'COMPLETED' } }),
    prisma.call.aggregate({
      where: { businessId, status: 'COMPLETED', duration: { not: null } },
      _avg: { duration: true },
    }),
    prisma.call.count({ where: { businessId, outcomeType: 'ORDER' } }),
  ]);

  return {
    total,
    answered,
    avgDuration: Math.round(avgDuration._avg.duration || 0),
    ordersTaken,
  };
};

// ─── Order Stats ─────────────────────────────────────────────────────────────

export const getOrderStats = async (businessId: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [ordersToday, totalRevenue, avgOrderValue, deliveryOrders] = await Promise.all([
    prisma.order.count({ where: { businessId, createdAt: { gte: today } } }),
    prisma.order.aggregate({ where: { businessId, status: { not: 'CANCELLED' } }, _sum: { amount: true } }),
    prisma.order.aggregate({ where: { businessId, status: { not: 'CANCELLED' } }, _avg: { amount: true } }),
    prisma.order.count({ where: { businessId, type: 'DELIVERY' } }),
  ]);

  const totalOrders = await prisma.order.count({ where: { businessId } });
  const deliveryRate = totalOrders > 0 ? Math.round((deliveryOrders / totalOrders) * 100) : 0;

  return {
    ordersToday,
    revenue: totalRevenue._sum.amount?.toString() || '0',
    avgOrderValue: avgOrderValue._avg.amount?.toString() || '0',
    deliveryRate,
  };
};

// ─── Reservation Stats ──────────────────────────────────────────────────────

export const getReservationStats = async (businessId: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [todayCovers, weeklyReservations, avgParty, noShows] = await Promise.all([
    prisma.reservation.aggregate({
      where: { businessId, dateTime: { gte: today }, status: { not: 'CANCELLED' } },
      _sum: { guests: true },
    }),
    prisma.reservation.count({ where: { businessId, createdAt: { gte: weekAgo } } }),
    prisma.reservation.aggregate({ where: { businessId }, _avg: { guests: true } }),
    prisma.reservation.count({ where: { businessId, status: 'NO_SHOW' } }),
  ]);

  const totalRes = await prisma.reservation.count({ where: { businessId } });
  const noShowRate = totalRes > 0 ? Math.round((noShows / totalRes) * 100) : 0;

  return {
    todayCovers: todayCovers._sum.guests || 0,
    weeklyReservations,
    avgPartySize: Math.round(avgParty._avg.guests || 0),
    noShowRate,
  };
};

// ─── Weekly Chart Data ───────────────────────────────────────────────────────

export const getWeeklyChartData = async (businessId: string) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const count = await prisma.call.count({
      where: {
        businessId,
        createdAt: { gte: date, lt: nextDay },
      },
    });

    days.push({
      date: date.toISOString().split('T')[0],
      day: date.toLocaleDateString('en', { weekday: 'short' }),
      calls: count,
    });
  }
  return days;
};
