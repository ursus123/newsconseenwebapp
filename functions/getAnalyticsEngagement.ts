import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('google_analytics');

    const { propertyId } = await req.json().catch(() => ({}));
    if (!propertyId) return Response.json({ error: 'propertyId is required' }, { status: 400 });

    // Fetch last 30 days of daily engagement from GA4 Data API
    const gaRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'averageSessionDuration' },
          ],
          orderBys: [{ dimension: { dimensionName: 'date' } }],
        }),
      }
    );

    if (!gaRes.ok) {
      const err = await gaRes.text();
      return Response.json({ error: err }, { status: gaRes.status });
    }

    const gaData = await gaRes.json();

    const rows = (gaData.rows || []).map((row) => ({
      date: row.dimensionValues[0].value,         // YYYYMMDD
      activeUsers: parseInt(row.metricValues[0].value) || 0,
      sessions: parseInt(row.metricValues[1].value) || 0,
      pageViews: parseInt(row.metricValues[2].value) || 0,
      avgSessionDuration: parseFloat(row.metricValues[3].value) || 0,
    }));

    // Totals for summary cards
    const totals = rows.reduce(
      (acc, r) => ({
        activeUsers: acc.activeUsers + r.activeUsers,
        sessions: acc.sessions + r.sessions,
        pageViews: acc.pageViews + r.pageViews,
      }),
      { activeUsers: 0, sessions: 0, pageViews: 0 }
    );

    return Response.json({ rows, totals });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});