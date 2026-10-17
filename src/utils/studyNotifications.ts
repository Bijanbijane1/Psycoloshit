export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function sendStudyReminderNotification(options: {
  title?: string;
  body?: string;
  streakDays?: number;
}): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const streak = options.streakDays || 1;
  const title = options.title || `🦉 دوئو: زنجیره ${streak} روزه شما منتظر شماست!`;
  const body =
    options.body ||
    `فقط ۵ دقیقه مرور کتابچه یا آزمون روان‌شناسی، زنجیره مطالعه شما را امروز حفظ می‌کند. بیا یک مرحله را با هم ببریم!`;

  try {
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'psychomaster-streak-reminder',
    });
    return true;
  } catch (err) {
    console.error('Notification display error:', err);
    return false;
  }
}
