-- Consolidated additive upgrade for existing databases.
-- This script preserves existing rows and can be safely re-run.
BEGIN;

ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_logo_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_video_url text;

ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS audio_tracks jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.tv_channels
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS stream_url text;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_selectable boolean NOT NULL DEFAULT false;

ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_page_key_check;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_page_key_check
  CHECK (page_key IN ('home', 'anime', 'cartoon', 'movie', 'all')) NOT VALID;

ALTER TABLE public.slider_content
  DROP CONSTRAINT IF EXISTS slider_content_page_key_check;
ALTER TABLE public.slider_content
  ADD CONSTRAINT slider_content_page_key_check
  CHECK (page_key IN ('home', 'anime', 'cartoon', 'movie')) NOT VALID;

CREATE TABLE IF NOT EXISTS public.episode_quality_icons (
  episode_id uuid NOT NULL REFERENCES public.content_episodes(id) ON DELETE CASCADE,
  quality_icon_id uuid NOT NULL REFERENCES public.quality_icons(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (episode_id, quality_icon_id)
);

CREATE INDEX IF NOT EXISTS episode_quality_icons_order_idx
  ON public.episode_quality_icons (episode_id, sort_order);

ALTER TABLE public.episode_quality_icons ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.episode_quality_icons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.episode_quality_icons TO authenticated;

DROP POLICY IF EXISTS episode_quality_icons_public_read ON public.episode_quality_icons;
CREATE POLICY episode_quality_icons_public_read ON public.episode_quality_icons
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1
      FROM public.content_episodes AS episode
      JOIN public.content_seasons AS season ON season.id = episode.season_id
      JOIN public.contents AS content ON content.id = season.content_id
      WHERE episode.id = episode_id AND episode.published AND content.published
    )
  );

DROP POLICY IF EXISTS episode_quality_icons_admin_manage ON public.episode_quality_icons;
CREATE POLICY episode_quality_icons_admin_manage ON public.episode_quality_icons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.content_characters (
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, character_id)
);

CREATE INDEX IF NOT EXISTS content_characters_order_idx
  ON public.content_characters (content_id, sort_order);

ALTER TABLE public.content_characters ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.content_characters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.content_characters TO authenticated;

DROP POLICY IF EXISTS content_characters_public_read ON public.content_characters;
CREATE POLICY content_characters_public_read ON public.content_characters
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.contents AS content
      WHERE content.id = content_id AND content.published
    )
  );

DROP POLICY IF EXISTS content_characters_admin_manage ON public.content_characters;
CREATE POLICY content_characters_admin_manage ON public.content_characters
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  kind text NOT NULL DEFAULT 'info' CHECK (kind IN ('success', 'info', 'error')),
  target_path text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS actor_name text;

CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx
  ON public.admin_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_unread_idx
  ON public.admin_notifications (is_read, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_notifications_select ON public.admin_notifications;
CREATE POLICY admin_notifications_select ON public.admin_notifications
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid()) AND users.role = 'admin'
  ));

DROP POLICY IF EXISTS admin_notifications_insert ON public.admin_notifications;
REVOKE INSERT ON public.admin_notifications FROM authenticated;

DROP POLICY IF EXISTS admin_notifications_update ON public.admin_notifications;
CREATE POLICY admin_notifications_update ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid()) AND users.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid()) AND users.role = 'admin'
  ));

DROP POLICY IF EXISTS admin_notifications_delete ON public.admin_notifications;
CREATE POLICY admin_notifications_delete ON public.admin_notifications
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid()) AND users.role = 'admin'
  ));

GRANT SELECT, UPDATE, DELETE ON public.admin_notifications TO authenticated;

-- Keep existing notification rows, but disable notification-producing triggers.
CREATE OR REPLACE FUNCTION public.notify_admin_content_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  content_label text;
  target text;
BEGIN
  IF coalesce(NEW.content_type, '') NOT IN ('movie', 'cartoon', 'anime') THEN
    RETURN NEW;
  END IF;

  content_label := CASE NEW.content_type
    WHEN 'movie' THEN 'film'
    WHEN 'cartoon' THEN 'çizgi dizi'
    ELSE 'anime'
  END;
  target := CASE NEW.content_type
    WHEN 'movie' THEN '/tr-tr/admin/movies/' || NEW.id::text || '/edit'
    ELSE '/tr-tr/admin/tv-shows/' || CASE NEW.content_type WHEN 'cartoon' THEN 'cartoons' ELSE 'animes' END || '/' || NEW.id::text || '/edit'
  END;

  INSERT INTO public.admin_notifications (title, message, kind, target_path)
  VALUES (
    'Yeni ' || content_label || ' eklendi',
    format('%s içeriği yönetim paneline eklendi: %s', initcap(content_label), NEW.title),
    'success',
    target
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_admin_content_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_notify_content_created ON public.contents;

CREATE OR REPLACE FUNCTION public.notify_admin_season_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  content_title text;
BEGIN
  SELECT title INTO content_title
  FROM public.contents
  WHERE id = NEW.content_id;

  INSERT INTO public.admin_notifications (title, message, kind, target_path)
  VALUES (
    'Yeni sezon eklendi',
    format('%s için %s. sezon eklendi.', coalesce(content_title, 'İçerik'), NEW.season_number),
    'success',
    '/tr-tr/admin/tv-shows/seasons/' || NEW.id::text || '/edit'
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_admin_season_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_notify_season_created ON public.content_seasons;

CREATE OR REPLACE FUNCTION public.notify_admin_episode_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  content_title text;
BEGIN
  SELECT contents.title INTO content_title
  FROM public.content_seasons
  JOIN public.contents ON contents.id = content_seasons.content_id
  WHERE content_seasons.id = NEW.season_id;

  INSERT INTO public.admin_notifications (title, message, kind, target_path)
  VALUES (
    'Yeni bölüm eklendi',
    format('%s dizisine yeni bölüm eklendi: %s', coalesce(content_title, 'İçerik'), NEW.title),
    'success',
    '/tr-tr/admin/tv-shows/episodes/' || NEW.id::text || '/edit'
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_admin_episode_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_notify_episode_created ON public.content_episodes;

CREATE OR REPLACE FUNCTION public.notify_admin_database_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  old_data jsonb;
  actor_id uuid;
  actor_display text;
  notification_title text;
  operation_label text;
  table_label text;
  record_label text;
  detail_label text;
  content_title text;
  season_number integer;
  episode_number integer;
  episode_title text;
  asset_type text;
  asset_label text;
  target text := '/tr-tr/admin/dashboard';
BEGIN
  IF NOT public.is_admin() THEN
    RETURN NULL;
  END IF;

  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  old_data := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  actor_id := auth.uid();
  SELECT NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), email
  INTO actor_display, record_label
  FROM public.users
  WHERE id = actor_id;
  actor_display := coalesce(actor_display, record_label, 'Yönetici');

  operation_label := CASE TG_OP
    WHEN 'INSERT' THEN 'eklendi'
    WHEN 'UPDATE' THEN 'güncellendi'
    WHEN 'DELETE' THEN 'silindi'
    ELSE lower(TG_OP)
  END;

  table_label := CASE TG_TABLE_NAME
    WHEN 'contents' THEN 'İçerik'
    WHEN 'content_seasons' THEN 'Sezon'
    WHEN 'content_episodes' THEN 'Bölüm'
    WHEN 'episode_media_assets' THEN 'Bölüm medyası'
    WHEN 'movies' THEN 'Film'
    WHEN 'genres' THEN 'Tür'
    WHEN 'collections' THEN 'Koleksiyon'
    WHEN 'slider_content' THEN 'Slider içeriği'
    WHEN 'quality_icons' THEN 'Kalite simgesi'
    WHEN 'age_icons' THEN 'Yaş simgesi'
    WHEN 'site_settings' THEN 'Site ayarları'
    WHEN 'users' THEN 'Kullanıcı'
    ELSE initcap(replace(TG_TABLE_NAME, '_', ' '))
  END;
  record_label := coalesce(
    nullif(trim(row_data ->> 'title'), ''),
    nullif(trim(row_data ->> 'name'), ''),
    nullif(trim(row_data ->> 'email'), ''),
    nullif(trim(row_data ->> 'label'), ''),
    table_label
  );
  detail_label := format('%s %s.', record_label, operation_label);

  IF TG_TABLE_NAME = 'contents' THEN
    IF TG_OP = 'INSERT' THEN
      content_title := CASE row_data ->> 'content_type'
        WHEN 'movie' THEN 'Film'
        WHEN 'cartoon' THEN 'Çizgi dizi'
        WHEN 'anime' THEN 'Anime'
        ELSE 'İçerik'
      END;
      notification_title := 'Yeni ' || lower(content_title) || ' eklendi';
      detail_label := format('%s eklendi: %s.', content_title, record_label);
    END IF;
    target := CASE row_data ->> 'content_type'
      WHEN 'movie' THEN '/tr-tr/admin/movies/' || (row_data ->> 'id') || '/edit'
      WHEN 'cartoon' THEN '/tr-tr/admin/tv-shows/cartoons/' || (row_data ->> 'id') || '/edit'
      WHEN 'anime' THEN '/tr-tr/admin/tv-shows/animes/' || (row_data ->> 'id') || '/edit'
      ELSE target
    END;
    IF TG_OP = 'UPDATE' THEN
      notification_title := CASE
        WHEN old_data ->> 'poster_url' IS DISTINCT FROM row_data ->> 'poster_url' THEN 'Poster değiştirildi'
        WHEN old_data ->> 'thumbnail_url' IS DISTINCT FROM row_data ->> 'thumbnail_url' THEN 'Yatay görsel değiştirildi'
        WHEN old_data ->> 'backdrop_url' IS DISTINCT FROM row_data ->> 'backdrop_url' THEN 'Arka plan görseli değiştirildi'
        WHEN old_data ->> 'logo_url' IS DISTINCT FROM row_data ->> 'logo_url' THEN 'İçerik logosu değiştirildi'
        WHEN old_data ->> 'title' IS DISTINCT FROM row_data ->> 'title' THEN 'İçerik adı değiştirildi'
        ELSE 'İçerik bilgileri güncellendi'
      END;
      detail_label := CASE
        WHEN old_data ->> 'poster_url' IS DISTINCT FROM row_data ->> 'poster_url' THEN format('%s posteri değiştirildi.', record_label)
        WHEN old_data ->> 'thumbnail_url' IS DISTINCT FROM row_data ->> 'thumbnail_url' THEN format('%s yatay görseli değiştirildi.', record_label)
        WHEN old_data ->> 'backdrop_url' IS DISTINCT FROM row_data ->> 'backdrop_url' THEN format('%s arka plan görseli değiştirildi.', record_label)
        WHEN old_data ->> 'logo_url' IS DISTINCT FROM row_data ->> 'logo_url' THEN format('%s logosu değiştirildi.', record_label)
        WHEN old_data ->> 'title' IS DISTINCT FROM row_data ->> 'title' THEN format('İçeriğin adı "%s" olarak değiştirildi.', record_label)
        ELSE format('%s bilgileri güncellendi.', record_label)
      END;
    END IF;
  ELSIF TG_TABLE_NAME = 'content_seasons' THEN
    SELECT contents.title INTO content_title
    FROM public.contents
    WHERE contents.id = (row_data ->> 'content_id')::uuid;
    season_number := coalesce(nullif(row_data ->> 'season_number', '')::integer, 0);
    record_label := coalesce(content_title, 'İçerik') || ' ' || season_number::text || '. sezon';
    target := '/tr-tr/admin/tv-shows/seasons/' || (row_data ->> 'id') || '/edit';
    IF TG_OP = 'UPDATE' AND old_data ->> 'poster_url' IS DISTINCT FROM row_data ->> 'poster_url' THEN
      notification_title := 'Sezon posteri değiştirildi';
      detail_label := format('%s posteri değiştirildi.', record_label);
    ELSE
      detail_label := format('%s %s.', record_label, operation_label);
    END IF;
  ELSIF TG_TABLE_NAME = 'content_episodes' THEN
    SELECT contents.title, content_seasons.season_number
    INTO content_title, season_number
    FROM public.content_seasons
    JOIN public.contents ON contents.id = content_seasons.content_id
    WHERE content_seasons.id = (row_data ->> 'season_id')::uuid;
    episode_number := coalesce(nullif(row_data ->> 'episode_number', '')::integer, 0);
    episode_title := format('%s %s. sezon %s. bölüm', coalesce(content_title, 'İçerik'), season_number, episode_number);
    record_label := coalesce(nullif(row_data ->> 'title', ''), 'Bölüm');
    target := '/tr-tr/admin/tv-shows/episodes/' || (row_data ->> 'id') || '/edit';
    IF TG_OP = 'INSERT' THEN
      notification_title := 'Yeni bölüm eklendi';
      detail_label := format('%s eklendi: %s.', episode_title, record_label);
    ELSIF TG_OP = 'UPDATE' AND old_data ->> 'poster_url' IS DISTINCT FROM row_data ->> 'poster_url' THEN
      notification_title := 'Bölüm posteri değiştirildi';
      detail_label := format('%s posteri değiştirildi.', episode_title);
    ELSIF TG_OP = 'UPDATE' AND old_data ->> 'poster_tv_url' IS DISTINCT FROM row_data ->> 'poster_tv_url' THEN
      notification_title := 'Bölüm TV posteri değiştirildi';
      detail_label := format('%s TV posteri değiştirildi.', episode_title);
    ELSIF TG_OP = 'UPDATE' AND old_data ->> 'title' IS DISTINCT FROM row_data ->> 'title' THEN
      notification_title := 'Bölüm başlığı değiştirildi';
      detail_label := format('%s başlığı "%s" olarak değiştirildi.', episode_title, record_label);
    ELSE
      detail_label := format('%s %s.', episode_title, operation_label);
    END IF;
  ELSIF TG_TABLE_NAME = 'episode_media_assets' THEN
    SELECT contents.title, content_seasons.season_number, content_episodes.episode_number
    INTO content_title, season_number, episode_number
    FROM public.content_episodes
    JOIN public.content_seasons ON content_seasons.id = content_episodes.season_id
    JOIN public.contents ON contents.id = content_seasons.content_id
    WHERE content_episodes.id = (row_data ->> 'episode_id')::uuid;
    asset_type := row_data ->> 'asset_type';
    asset_label := row_data ->> 'label';
    episode_title := format('%s %s. sezon %s. bölüm', coalesce(content_title, 'İçerik'), season_number, episode_number);
    record_label := CASE asset_type
      WHEN 'source' THEN CASE WHEN coalesce(asset_label, '') = 'Main' THEN 'video kaynağı' ELSE coalesce(asset_label, 'kalite') || ' video kalitesi' END
      WHEN 'subtitle' THEN coalesce(asset_label, 'Altyazı') || ' altyazısı'
      WHEN 'audio' THEN coalesce(asset_label, 'Ses') || ' ses parçası'
      ELSE 'medya dosyası'
    END;
    target := '/tr-tr/admin/tv-shows/episodes/' || (row_data ->> 'episode_id') || '/edit';
    notification_title := format('Bölüm %s %s',
      CASE asset_type WHEN 'source' THEN 'videosu' WHEN 'subtitle' THEN 'altyazısı' WHEN 'audio' THEN 'ses parçası' ELSE 'medyası' END,
      CASE TG_OP WHEN 'INSERT' THEN 'eklendi' WHEN 'DELETE' THEN 'silindi' ELSE 'güncellendi' END);
    detail_label := format('%s %s %s.', episode_title, record_label,
      CASE TG_OP WHEN 'INSERT' THEN 'eklendi' WHEN 'DELETE' THEN 'silindi' ELSE 'güncellendi' END);
  END IF;

  INSERT INTO public.admin_notifications (title, message, kind, target_path, actor_name)
  VALUES (
    coalesce(notification_title, CASE
      WHEN TG_OP = 'INSERT' THEN table_label || ' eklendi'
      WHEN TG_OP = 'DELETE' THEN table_label || ' silindi'
      ELSE table_label || ' güncellendi'
    END),
    detail_label,
    'info',
    target,
    actor_display
  );

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_admin_database_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_notify_content_created ON public.contents;
DROP TRIGGER IF EXISTS admin_notify_season_created ON public.content_seasons;
DROP TRIGGER IF EXISTS admin_notify_episode_created ON public.content_episodes;

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'admin_notifications'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS admin_notify_database_change ON public.%I', table_record.tablename);
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'admin_notifications'
    )
  THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_notifications;
  END IF;
END;
$$;

COMMIT;
