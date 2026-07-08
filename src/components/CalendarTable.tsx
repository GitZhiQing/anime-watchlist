import { CalendarCard } from "@/components/CalendarCard";
import type { CalendarDay } from "@/types/bgm";

interface CalendarTableProps {
  data: CalendarDay[];
}

/** JS getDay() (0=Sun) 映射为 Bangumi weekday.id (1=Mon..7=Sun) */
function getTodayBangumiWeekday(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** 每日放送表格视图：7 列网格，每列对应一周中的一天 */
export function CalendarTable({ data }: CalendarTableProps) {
  const todayId = getTodayBangumiWeekday();

  return (
    <div className="mx-auto grid w-full max-w-[1000px] grid-cols-7 gap-3 overflow-x-auto">
      {data.map((day) => {
        const isToday = day.weekday.id === todayId;
        return (
          <div key={day.weekday.id} className="flex min-w-0 flex-col gap-2">
            {/* 列头：星期 + 当天高亮 */}
            <h3
              className={`text-center text-sm font-semibold ${
                isToday
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {day.weekday.cn}
              {isToday && (
                <span className="text-[10px] text-muted-foreground">
                  {" "}[今天]
                </span>
              )}
            </h3>

            {/* 列内容 */}
            {day.items.length > 0 ? (
              day.items.map((item) => (
                <CalendarCard key={item.id} item={item} />
              ))
            ) : (
              <span className="py-4 text-center text-xs text-muted-foreground">
                暂无
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
