BEGIN;

DO $$
DECLARE
  table_record record;
BEGIN
  IF to_regclass('public.contents') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS admin_notify_content_created ON public.contents';
  END IF;
  IF to_regclass('public.content_seasons') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS admin_notify_season_created ON public.content_seasons';
  END IF;
  IF to_regclass('public.content_episodes') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS admin_notify_episode_created ON public.content_episodes';
  END IF;

  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'admin_notifications'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS admin_notify_database_change ON public.%I', table_record.tablename);
  END LOOP;

  IF to_regclass('public.admin_notifications') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_notifications_insert ON public.admin_notifications';
    EXECUTE 'REVOKE INSERT ON public.admin_notifications FROM authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_notifications;
  END IF;
END;
$$;

COMMIT;
