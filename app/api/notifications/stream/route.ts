import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const sendUnread = () => {
        try {
          const db = getDb();
          const row = db.prepare(`
            SELECT COUNT(*) as unread_count
            FROM notifications
            WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0
          `).get(user.id) as { unread_count: number };

          const latest = db.prepare(`
            SELECT id, category, title, message, link_url, created_at
            FROM notifications
            WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0
            ORDER BY id DESC LIMIT 5
          `).all(user.id);

          const payload = JSON.stringify({ unreadCount: row.unread_count, latest });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // ignore transient stream errors
        }
      };

      sendUnread();
      intervalId = setInterval(sendUnread, 5000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
