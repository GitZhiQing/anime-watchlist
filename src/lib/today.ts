// 今日放送条目 id 集合：复用每日放送日历缓存（与新番页/热度榜兜底共用 ["calendar"]），
// 按今天星期取对应放送组的条目 id。用于追番页「今天更新」标识——缓存命中时零额外请求。
import { useEffect, useMemo, useState } from "react";
import { useCalendar } from "@/lib/queries";

/** JS getDay() (0=Sun) → Bangumi weekday.id (1=Mon..7=Sun) */
function todayWeekday(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * 今日放送的条目 id 集合（undefined = 日历未加载）。
 * 内部 60s 心跳刷新星期值，跨 0 点后标识自动迁移到新的放送组。
 * enabled 由调用方门控（登录且进入追番页），日历请求走公开接口无需认证。
 */
export function useTodayAiringIds(enabled: boolean): Set<number> | undefined {
  const [weekday, setWeekday] = useState(todayWeekday);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setWeekday(todayWeekday()), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const { data: calendar } = useCalendar(enabled);

  return useMemo(() => {
    if (!calendar) return undefined;
    const day = calendar.find((d) => d.weekday.id === weekday);
    return new Set((day?.items ?? []).map((it) => it.id));
  }, [calendar, weekday]);
}
