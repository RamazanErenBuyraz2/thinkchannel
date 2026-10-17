BEGIN;

ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS outro_start text,
  ADD COLUMN IF NOT EXISTS outro_end text;

ALTER TABLE public.content_episodes
  ADD COLUMN IF NOT EXISTS outro_start text,
  ADD COLUMN IF NOT EXISTS outro_end text;

ALTER TABLE public.profile_watch_history
  ADD COLUMN IF NOT EXISTS episode_id uuid
    REFERENCES public.content_episodes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.profile_settings (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{
    "autoplay_enabled": false,
    "auto_next_episode": false,
    "skip_intro_enabled": false,
    "preferred_subtitle_language": null,
    "preferred_audio_language": null,
    "subtitles_enabled": false,
    "playback_speed": 1,
    "ambient_enabled": false,
    "loop_enabled": "Kapalı",
    "color_filter": "Varsayılan",
    "preferred_quality": "Otomatik",
    "subtitle_size": "Orta",
    "subtitle_font_style": 0,
    "subtitle_shadow_enabled": false,
    "subtitle_text_color": "#ffffff",
    "subtitle_text_opacity": 100,
    "subtitle_background_color": "transparent",
    "subtitle_background_opacity": 0,
    "player_scale": 1
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.profile_settings TO authenticated;

DROP POLICY IF EXISTS profile_settings_owner_manage ON public.profile_settings;
CREATE POLICY profile_settings_owner_manage ON public.profile_settings
  FOR ALL TO authenticated USING (public.owns_profile(profile_id))
  WITH CHECK (public.owns_profile(profile_id));

CREATE OR REPLACE FUNCTION public.increment_content_watch(
  p_profile_id uuid,
  p_content_id uuid,
  p_episode_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Profile is not owned by the current user';
  END IF;

  IF p_episode_id IS NOT NULL THEN
    UPDATE public.content_episodes AS episode
    SET watch_count = episode.watch_count + 1
    FROM public.content_seasons AS season
    WHERE episode.id = p_episode_id
      AND episode.season_id = season.id
      AND season.content_id = p_content_id
      AND episode.published
      AND EXISTS (
        SELECT 1 FROM public.contents AS content
        WHERE content.id = p_content_id AND content.published
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Published episode was not found for this content';
    END IF;
  ELSE
    UPDATE public.movies
    SET watch_count = watch_count + 1
    WHERE id = p_content_id
      AND EXISTS (
        SELECT 1 FROM public.contents AS content
        WHERE content.id = p_content_id AND content.published
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Published movie was not found';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_content_watch(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_content_watch(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
