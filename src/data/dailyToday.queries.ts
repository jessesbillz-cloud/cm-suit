// Today's reports on All my jobs (0045, SPEC §13.1): My Daily Reports' home. The database answers as the caller: my own
// setups and reports only, "today" in each job's zone. Starting today's report is the dailies Start (create_daily_report).
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { dailyTodaySchema, type DailyTodayRow } from './dailyToday.types';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockDailyToday from './mock/dailyToday';

const rowsSchema = z.array(dailyTodaySchema);

async function fetchDailyToday(): Promise<DailyTodayRow[]> {
  if (isMock()) return mockDailyToday.dailyToday();
  return rowsSchema.parse(throwIfError(await supabase.rpc('my_daily_today')));
}

/** Asked again whenever it is shown: a report started or submitted in Dailies, or a new day, shows at once. */
export function useDailyToday() {
  return useQuery({ queryKey: qk.dailyToday, queryFn: fetchDailyToday, refetchOnMount: 'always' });
}
