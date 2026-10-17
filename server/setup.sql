-- Think Channel single-file database setup.
-- Safe for new installations only. Existing databases must use upgrade.sql.
-- The transaction guard below prevents this setup from deleting existing data.

BEGIN;

DO $setup_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = relation.relnamespace
    WHERE nsp.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname IN ('users', 'contents', 'content_seasons', 'content_episodes', 'genres')
  ) THEN
    RAISE EXCEPTION 'setup.sql is only for a new installation and was stopped before changing data. Use server/upgrade.sql for an existing database.';
  END IF;
END;
$setup_guard$;

-- ===== schema.sql =====

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  terms_accepted_at timestamptz,
  terms_version text,
  privacy_policy_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.account_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = lower(btrim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.account_email_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_email_exists(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  is_kids boolean NOT NULL DEFAULT false,
  pin_enabled boolean NOT NULL DEFAULT false,
  avatar_url text,
  sort_order integer NOT NULL DEFAULT 0,
  personalize_homepage boolean NOT NULL DEFAULT true,
  preferred_categories text[] NOT NULL DEFAULT '{}',
  preferred_genres text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_user_order_idx ON public.profiles (user_id, sort_order, created_at);

CREATE TABLE public.profile_settings (
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

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content_type text CHECK (content_type IS NULL OR content_type IN ('movie', 'cartoon', 'anime')),
  description text,
  release_date date,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.genres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content_type text CHECK (content_type IS NULL OR content_type IN ('movie', 'cartoon', 'anime')),
  description text,
  genre text,
  poster_url text,
  thumbnail_url text,
  thumbnail_logo_url text,
  backdrop_url text,
  logo_url text,
  banner_video_url text,
  release_year smallint CHECK (release_year IS NULL OR release_year BETWEEN 1888 AND 2200),
  score numeric(3, 1) CHECK (score IS NULL OR score BETWEEN 0 AND 10),
  production_origin text CHECK (production_origin IS NULL OR production_origin IN ('turkish', 'foreign')),
  countries text[] NOT NULL DEFAULT '{}',
  release_status text CHECK (release_status IS NULL OR release_status IN ('ongoing', 'on_break', 'completed')),
  platform_names text[] NOT NULL DEFAULT '{}',
  imdb_rating numeric(3, 1) CHECK (imdb_rating IS NULL OR imdb_rating BETWEEN 0 AND 10),
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS production_origin text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_logo_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_video_url text,
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS release_status text,
  ADD COLUMN IF NOT EXISTS platform_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS imdb_rating numeric(3, 1);

CREATE INDEX contents_public_order_idx ON public.contents (published, sort_order, title);
CREATE INDEX contents_content_type_idx ON public.contents (content_type, sort_order, title);

CREATE TABLE public.movies (
  id uuid PRIMARY KEY REFERENCES public.contents(id) ON DELETE CASCADE,
  actor text,
  director text,
  language text NOT NULL DEFAULT 'English',
  thumbnail_url text,
  poster_tv_url text,
  logo_url text,
  trailer_url text,
  trailer_type text,
  description text,
  countries text[] NOT NULL DEFAULT '{}',
  imdb_rating numeric(3, 1) CHECK (imdb_rating IS NULL OR imdb_rating BETWEEN 0 AND 10),
  content_rating text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  skip_intro_start text,
  skip_intro_end text,
  outro_start text,
  outro_end text,
  download_enabled boolean NOT NULL DEFAULT true,
  video_upload_type text,
  video_url text,
  embed_code text,
  quality_enabled boolean NOT NULL DEFAULT false,
  qualities jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtitle_enabled boolean NOT NULL DEFAULT false,
  subtitles jsonb NOT NULL DEFAULT '[]'::jsonb,
  audio_tracks jsonb NOT NULL DEFAULT '[]'::jsonb,
  like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  watch_count integer NOT NULL DEFAULT 0 CHECK (watch_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX movies_language_idx ON public.movies (language);
CREATE TABLE public.content_categories (
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, category_id)
);

CREATE INDEX content_categories_category_idx ON public.content_categories (category_id, content_id);

CREATE TABLE public.age_icons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  minimum_age smallint NOT NULL CHECK (minimum_age BETWEEN 0 AND 21),
  icon_url text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quality_icons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  icon_url text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.content_age_icons (
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  age_icon_id uuid NOT NULL REFERENCES public.age_icons(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, age_icon_id)
);

CREATE TABLE public.content_quality_icons (
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  quality_icon_id uuid NOT NULL REFERENCES public.quality_icons(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, quality_icon_id)
);

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description text,
  page_key text NOT NULL DEFAULT 'home'
    CHECK (page_key IN ('home', 'anime', 'cartoon', 'movie', 'all')),
  is_homepage boolean NOT NULL DEFAULT false,
  personalization_mode text NOT NULL DEFAULT 'everyone'
    CHECK (personalization_mode IN ('everyone', 'profile_preferences')),
  selection_mode text NOT NULL DEFAULT 'manual'
    CHECK (selection_mode IN ('manual', 'automatic')),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  genre_filter text[] NOT NULL DEFAULT '{}',
  max_items integer NOT NULL DEFAULT 20 CHECK (max_items BETWEEN 1 AND 100),
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (selection_mode <> 'automatic' OR category_id IS NOT NULL)
);

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS is_homepage boolean NOT NULL DEFAULT false;

CREATE INDEX collections_page_order_idx
  ON public.collections (published, page_key, sort_order);

CREATE TABLE public.collection_items (
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, content_id)
);

CREATE INDEX collection_items_order_idx ON public.collection_items (collection_id, sort_order);

CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type text NOT NULL CHECK (section_type IN ('collection', 'featured_selection', 'top_ten', 'continue_watching')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  collection_id uuid REFERENCES public.collections(id) ON DELETE CASCADE,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (section_type IN ('collection', 'featured_selection', 'top_ten') AND collection_id IS NOT NULL)
    OR (section_type = 'continue_watching' AND collection_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS homepage_sections_order_idx
  ON public.homepage_sections (published, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS homepage_sections_unique_special_type
  ON public.homepage_sections (section_type)
  WHERE section_type IN ('top_ten', 'continue_watching');

CREATE TABLE public.slider_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.contents(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  image_url text,
  logo_url text,
  background_video_url text,
  eyebrow text,
  action_label text,
  action_url text,
  page_key text NOT NULL DEFAULT 'home'
    CHECK (page_key IN ('home', 'anime', 'cartoon', 'movie')),
  sort_order integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

ALTER TABLE public.slider_content
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS background_video_url text;

CREATE INDEX slider_content_page_order_idx
  ON public.slider_content (published, page_key, sort_order);

CREATE TABLE public.profile_watchlist (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, content_id)
);

CREATE INDEX profile_watchlist_content_idx ON public.profile_watchlist (content_id);

CREATE TABLE public.profile_watch_history (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  episode_id uuid,
  progress_seconds integer NOT NULL DEFAULT 0 CHECK (progress_seconds >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  completed_at timestamptz,
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, content_id)
);

CREATE INDEX profile_watch_history_recent_idx
  ON public.profile_watch_history (profile_id, last_watched_at DESC);

CREATE TABLE public.profile_homepage_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  hidden_collection_ids uuid[] NOT NULL DEFAULT '{}',
  pinned_collection_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profile_pin_credentials (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profile_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_email text NOT NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'completed', 'cancelled', 'expired')),
  failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_transfer_source_idx
  ON public.profile_transfer_requests (source_user_id, created_at DESC);
CREATE INDEX profile_transfer_target_idx
  ON public.profile_transfer_requests (target_email, status);

CREATE TABLE public.profile_transfer_credentials (
  transfer_request_id uuid PRIMARY KEY REFERENCES public.profile_transfer_requests(id) ON DELETE CASCADE,
  verification_code_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL CHECK (length(trim(question)) BETWEEN 1 AND 240),
  answer text NOT NULL CHECK (length(trim(answer)) BETWEEN 1 AND 5000),
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX faq_items_public_order_idx
  ON public.faq_items (published, sort_order, created_at);

CREATE TABLE public.legal_documents (
  slug text PRIMARY KEY CHECK (slug IN ('privacy-policy', 'terms-of-use')),
  title text NOT NULL,
  description text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sections) = 'array'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.faq_items (question, answer, sort_order, published) VALUES
  ('Think Channel nedir?', 'Think Channel; her yaş grubuna hitap eden klasik çizgi filmleri, nostaljik yapımları ve özel animasyon serilerini yüksek görüntü kalitesiyle izleyicilerle buluşturan dijital bir çizgi yayın platformudur.', 0, true),
  ('Think Channel’a nasıl üye olurum?', 'Ana sayfamızdaki Kayıt Ol butonuna tıklayarak e-posta adresiniz ve şifrenizle ücretsiz bir hesap oluşturabilirsiniz.', 1, true),
  ('Platformu kullanmak ücretli mi?', 'Think Channel’da hem ücretsiz olarak erişebileceğiniz içerikler hem de nostaljik ve özel arşive sınırsız, reklamsız erişim sağlayan premium abonelik seçenekleri yer alır.', 2, true),
  ('Şifremi unuttum, nasıl sıfırlarım?', 'Giriş ekranındaki Şifremi Unuttum bağlantısına tıklayıp e-posta adresinizi girerek gelen güvenli bağlantı üzerinden şifrenizi yenileyebilirsiniz.', 3, true),
  ('Çizgi filmleri telefonuma indirebilir miyim?', 'Telif hakları ve platform güvenlik standartları gereği içerikler yalnızca çevrim içi (online) olarak izlenebilir; indirme desteği bulunmamaktadır.', 4, true),
  ('Videoların dil ve altyazı seçenekleri var mı?', 'Evet. Desteklenen yapımlarda orijinal seslendirme, Türkçe dublaj veya altyazı seçeneklerini video oynatıcı üzerindeki ayarlar menüsünden değiştirebilirsiniz.', 5, true),
  ('Aboneliğimi dilediğim zaman iptal edebilir miyim?', 'Evet, aboneliğinizi istediğiniz zaman hesap ayarlarınızdan iptal edebilirsiniz. İptal etseniz bile, ödemesini yaptığınız dönemin sonuna kadar izlemeye devam edebilirsiniz.', 6, true),
  ('Videolarda neden donma veya takılma oluyor?', 'Bu durum genellikle internet bağlantı hızınızın anlık düşmesinden kaynaklanır. Video oynatıcı panelinden çözünürlüğü (kaliteyi) bir alt seviyeye çekerek sorunu çözebilirsiniz.', 7, true),
  ('Hesap ve kişisel verilerimi tamamen silebilir miyim?', 'Evet. Hesap ayarları bölümündeki Hesabımı Sil seçeneğini kullanarak üyeliğinizi ve kişisel verilerinizi silme talebinde bulunabilirsiniz.', 8, true);

INSERT INTO public.legal_documents (slug, title, description, sections, version) VALUES
  (
    'privacy-policy',
    'Gizlilik Politikası',
    'Think Channel kişisel verilerinizi nasıl toplar, kullanır, paylaşır ve korur.',
    $privacy$
    [
      {"title":"1. Toplanan Kişisel Veriler","paragraphs":["Platformumuzu ziyaret ettiğinizde veya hizmetlerimizden yararlandığınızda, doğrudan ya da dolaylı olarak bazı verileriniz toplanabilir:","• Doğrudan sağlanan veriler: Hesap oluştururken veya abonelik işlemlerini gerçekleştirirken paylaştığınız ad, soyad, e-posta adresi, doğum tarihi ve ödeme bilgileri.","• Kullanım ve etkileşim verileri: Platformda izlediğiniz çizgi içerikler, favorileriniz, arama geçmişiniz, yayınlarla ilgili yaptığınız yorumlar ve platform içi tercihleriniz.","• Teknik ve cihaz verileri: IP adresiniz, tarayıcı türünüz, işletim sisteminiz, cihaz kimliğiniz, erişim tarih ve saatleriniz gibi otomatik olarak toplanan teknik veriler."]},
      {"title":"2. Verilerin Toplanma Yöntemleri ve Hukuki Sebebi","paragraphs":["Kişisel verileriniz Think Channel web sitesi, mobil uygulamaları veya resmi iş ortaklarımız aracılığıyla elektronik ortamda toplanmaktadır. Bu veriler;","• Sözleşmenin kurulması ve ifası (üyelik işlemlerinin yürütülmesi),","• Kanuni yükümlülüklerin yerine getirilmesi,","• Meşru menfaatlerimiz doğrultusunda hizmet kalitesinin artırılması hukuki sebepleriyle işlenmektedir."]},
      {"title":"3. Toplanan Verilerin Kullanım Amaçları","paragraphs":["Elde ettiğimiz kişisel veriler aşağıdaki amaçlar doğrultusunda kullanılmaktadır:","• Think Channel platformundaki çizgi içerikleri sunmak, kişiselleştirmek ve yayın akışını yönetmek.","• Üyelik hesabınızı oluşturmak, güvenliğini sağlamak ve üyelik yönetimi işlemlerini gerçekleştirmek.","• Ödeme işlemlerini güvence altına almak ve faturalandırma süreçlerini yürütmek.","• Kullanıcı deneyimini iyileştirmek, öneri sistemlerini geliştirmek ve teknik destek taleplerinize yanıt vermek.","• Yasal düzenlemelerden kaynaklanan yükümlülüklerimizi yerine getirmek."]},
      {"title":"4. Verilerin Paylaşımı ve Aktarımı","paragraphs":["Kişisel verileriniz KVKK ve ilgili veri koruma mevzuatına uygun olarak yalnızca şu taraflarla paylaşılabilir:","• Hizmet sağlayıcılar: Altyapı, barındırma (hosting), ödeme altyapısı ve müşteri destek hizmetleri aldığımız güvenilir üçüncü taraf iş ortakları.","• Yasal merciler: Mahkeme kararları, yasal zorunluluklar veya resmi kurum talepleri doğrultusunda kanunen yetkili kamu kurum ve kuruluşları.","Kişisel verileriniz hiçbir suretle ticari amaçla üçüncü kişilere satılmaz veya kiralanmaz."]},
      {"title":"5. Çerez (Cookie) Teknolojileri","paragraphs":["Think Channel, kullanıcı deneyimini optimize etmek, site trafiğini analiz etmek ve tercihlerinizi hatırlamak amacıyla çerezler kullanmaktadır. Tarayıcı ayarlarınız üzerinden çerez kullanımını dilediğiniz zaman kısıtlayabilir veya tamamen engelleyebilirsiniz; ancak bu durum platformun bazı özelliklerinin düzgün çalışmasını etkileyebilir."]},
      {"title":"6. Veri Güvenliği","paragraphs":["Topladığımız kişisel verilerin güvenliğini sağlamak amacıyla şifreleme yöntemleri, güvenlik duvarları ve erişim yetki matrisleri gibi teknik ve idari tedbirler uygulamaktayız. Sistemlerimizin güvenliğini sürekli olarak denetliyor ve güncelliyoruz."]},
      {"title":"7. Çocukların Gizliliği","paragraphs":["Think Channel, her yaş grubuna hitap eden çizgi yayın platformu olması sebebiyle çocukların gizliliğine özellikle dikkat eder. 18 yaşın altındaki kullanıcıların kişisel verileri, ebeveynlerinin ya da yasal vasilerinin onayı olmaksızın işlenmez. Ebeveynler, çocuklarının verilerine ilişkin bilgi talep etme ve silinmesini isteme hakkına sahiptir."]},
      {"title":"8. Kullanıcı Hakları ve Hakların Kullanılması","paragraphs":["Kişisel veri sahipleri olarak kanun kapsamındaki haklarınız şunlardır:","• Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse buna ilişkin bilgi talep etme.","• İşlenme amacını ve verilerin amacına uygun kullanılıp kullanılmadığını öğrenme.","• Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme.","• Verilerin eksik veya yanlış işlenmiş olması hâlinde düzeltilmesini isteme.","• İlgili mevzuat çerçevesinde verilerin silinmesini veya yok edilmesini talep etme.","Haklarınızı kullanmak veya gizlilik politikamızla ilgili soru sormak için destek@thinkchannel.com adresi üzerinden bizimle iletişime geçebilirsiniz."]}
    ]
    $privacy$::jsonb,
    1
  ),
  (
    'terms-of-use',
    'Think Channel - Kullanım Koşulları',
    'Son Güncelleme Tarihi: 13 Ekim 2026. Platformu ziyaret ederek, üye olarak veya içerikleri izleyerek aşağıdaki koşulları kabul etmiş olursunuz.',
    $terms$
    [
      {"title":"1. Taraflar ve Kapsam","paragraphs":["Bu Kullanım Koşulları, Think Channel platformunu işleten şirket (Think Channel) ile platforma üye olan veya herhangi bir şekilde erişim sağlayan kullanıcı arasındaki hak ve yükümlülükleri düzenler. Platformun tüm kullanım hakları ve yönetimi Think Channel’a aittir."]},
      {"title":"2. Üyelik ve Hesap Güvenliği","paragraphs":["• Kayıt olma: Platformdaki belirli içeriklere erişmek veya ek özelliklerden yararlanabilmek için doğru ve güncel bilgilerle kayıt olmanız gerekmektedir.","• Hesap sorumluluğu: Hesabınızın ve şifrenizin güvenliğini sağlamak sizin sorumluluğunuzdadır. Hesabınızla gerçekleştirilen faaliyetlerden siz sorumlu tutulursunuz. Yetkisiz kullanım fark edilmesi durumunda derhal Think Channel’a bildirilmelidir."]},
      {"title":"3. Hizmetin Kapsamı ve Değişiklikler","paragraphs":["Think Channel, kullanıcılara çevrim içi çizgi film, animasyon ve benzeri çizgi yayın içeriklerini sunan dijital bir platformdur.","Think Channel; teknolojik gelişmeler, telif hakları veya operasyonel gereksinimler doğrultusunda platformun içeriğini, yayın akışını, abonelik modellerini ve sunulan hizmetleri dilediği zaman önceden haber vermeksizin değiştirme, askıya alma veya sonlandırma hakkını saklı tutar."]},
      {"title":"4. Fikri Mülkiyet Hakları","paragraphs":["Platformda yer alan tüm çizgi içerikler, logolar, grafikler, tasarımlar, yazılımlar, ses ve video dosyaları Think Channel’ın veya lisans verenlerinin mülkiyetindedir ve 5846 sayılı Fikir ve Sanat Eserleri Kanunu ile uluslararası telif hakkı mevzuatınca korunmaktadır.","Kullanıcılar, platformdaki içerikleri yalnızca kişisel ve ticari olmayan amaçlarla izleyebilir. İçeriklerin kopyalanması, indirilmesi, çoğaltılması, başka bir mecrada yayınlanması, tersine mühendisliğe tabi tutulması veya ticari amaçla kullanılması yasaktır."]},
      {"title":"5. Kullanıcı Davranış Kuralları","paragraphs":["Platformu kullanırken aşağıdaki kurallara uymayı kabul edersiniz:","• Diğer kullanıcıları taciz etmemek, tehdit etmemek, hakaret etmemek veya kişilik haklarına saldırıda bulunmamak.","• Platform altyapısına zarar verecek zararlı yazılımlar yüklememek veya sistemi manipüle etmeye çalışmamak.","• Telif hakkıyla korunan materyalleri yasadışı yollarla platforma yüklememek veya paylaşmamak.","• Yürürlükteki ulusal ve uluslararası yasalara, kamu düzenine ve genel ahlak kurallarına aykırı hareket etmemek."]},
      {"title":"6. Abonelik, Ücretlendirme ve İptal Koşulları","paragraphs":["• Ödemeler: Think Channel bazı içerikler veya gelişmiş özellikler için ücretli abonelik modelleri sunabilir. Seçtiğiniz abonelik planına ait ücretler, kayıt sırasında belirttiğiniz ödeme yöntemi üzerinden tahsil edilir.","• İptal ve iade: Aboneliğinizi istediğiniz zaman kullanıcı panelinizden iptal edebilirsiniz. İptal işlemi, mevcut fatura döneminin sonuna kadar yayınları izlemeye devam etmenizi sağlar; aksi belirtilmedikçe geçmiş dönem ücretleri için iade yapılmaz."]},
      {"title":"7. Sorumluluğun Sınırlandırılması","paragraphs":["Think Channel, platformun kesintisiz, hatasız veya tamamen güvenli olacağını garanti etmez. Platform olduğu gibi sunulur.","İnternet altyapısından, kullanıcı cihazlarından veya üçüncü taraflardan kaynaklanan kesintilerden, veri kayıplarından ya da erişim sorunlarından Think Channel sorumlu tutulamaz."]},
      {"title":"8. Fesih ve Askıya Alma","paragraphs":["Kullanım Koşulları’na, yasalara veya topluluk kurallarına aykırı hareket ettiğinizin tespiti hâlinde Think Channel, önceden bildirimde bulunmaksızın hesabınızı askıya alma, sonlandırma ve yasal yollara başvurma hakkını saklı tutar."]},
      {"title":"9. Uyuşmazlıkların Çözümü ve Değişiklikler","paragraphs":["• Yürürlükteki hukuk: Bu koşulların uygulanmasında ve yorumlanmasında Türkiye Cumhuriyeti kanunları geçerlidir. Uyuşmazlıkların çözümünde ilgili mahkemeler ve icra daireleri yetkilidir.","• Koşulların güncellenmesi: Think Channel, Kullanım Koşulları’nı dilediği zaman güncelleme hakkına sahiptir. Güncellenen koşullar platformda yayınlandığı an yürürlüğe girer; kullanıcılar platformu kullanmaya devam ederek bu değişiklikleri kabul etmiş sayılır."]}
    ]
    $terms$::jsonb,
    1
  );

CREATE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id, email, first_name, last_name, marketing_consent, marketing_consent_at,
    terms_accepted_at, terms_version, privacy_policy_version
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    COALESCE((NEW.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
    CASE
      WHEN COALESCE((NEW.raw_user_meta_data ->> 'marketing_consent')::boolean, false) THEN now()
      ELSE NULL
    END,
    NULLIF(NEW.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    NEW.raw_user_meta_data ->> 'terms_version',
    NEW.raw_user_meta_data ->> 'privacy_policy_version'
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE FUNCTION public.handle_auth_user_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email, updated_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_email_change();

INSERT INTO public.users (
  id, email, first_name, last_name, marketing_consent, marketing_consent_at,
  terms_accepted_at, terms_version, privacy_policy_version
)
SELECT
  account.id,
  account.email,
  COALESCE(account.raw_user_meta_data ->> 'first_name', ''),
  COALESCE(account.raw_user_meta_data ->> 'last_name', ''),
  COALESCE((account.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
  CASE
    WHEN COALESCE((account.raw_user_meta_data ->> 'marketing_consent')::boolean, false) THEN account.created_at
    ELSE NULL
  END,
  NULLIF(account.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
  account.raw_user_meta_data ->> 'terms_version',
  account.raw_user_meta_data ->> 'privacy_policy_version'
FROM auth.users AS account;

CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;

CREATE FUNCTION public.owns_profile(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = profile_id AND user_id = (SELECT auth.uid())
  );
$$;

CREATE VIEW public.collection_content_items WITH (security_invoker = true) AS
WITH candidate_items AS (
  SELECT
    collection.id AS collection_id,
    content.id AS content_id,
    item.sort_order,
    item.created_at
  FROM public.collections AS collection
  JOIN public.collection_items AS item ON item.collection_id = collection.id
  JOIN public.contents AS content ON content.id = item.content_id
  WHERE collection.selection_mode = 'manual'
    AND content.published
    AND (collection.published OR public.is_admin())

  UNION ALL

  SELECT
    collection.id AS collection_id,
    content.id AS content_id,
    row_number() OVER (
      PARTITION BY collection.id
      ORDER BY content.sort_order, content.title
    )::integer AS sort_order,
    content.created_at
  FROM public.collections AS collection
  JOIN public.content_categories AS category_link ON category_link.category_id = collection.category_id
  JOIN public.contents AS content ON content.id = category_link.content_id
  WHERE collection.selection_mode = 'automatic'
    AND content.published
    AND (collection.published OR public.is_admin())
    AND (
      cardinality(collection.genre_filter) = 0
      OR content.genre = ANY(collection.genre_filter)
    )
)
SELECT collection_id, content_id, sort_order
FROM (
  SELECT
    candidate_items.*,
    row_number() OVER (
      PARTITION BY candidate_items.collection_id
      ORDER BY candidate_items.sort_order, candidate_items.created_at, candidate_items.content_id
    ) AS item_number,
    collection.max_items
  FROM candidate_items
  JOIN public.collections AS collection ON collection.id = candidate_items.collection_id
) AS limited_items
WHERE item_number <= max_items;

GRANT SELECT ON public.collection_content_items TO anon, authenticated;

CREATE FUNCTION public.set_profile_pin(p_profile_id uuid, new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.owns_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Profile not found or not owned by the current account.';
  END IF;
  IF new_pin IS NULL OR new_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must contain 4 to 6 digits.';
  END IF;

  INSERT INTO public.profile_pin_credentials (profile_id, pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (p_profile_id, extensions.crypt(new_pin, extensions.gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (profile_id) DO UPDATE SET
    pin_hash = EXCLUDED.pin_hash,
    failed_attempts = 0,
    locked_until = NULL,
    updated_at = now();

  UPDATE public.profiles SET pin_enabled = true, updated_at = now() WHERE id = p_profile_id;
END;
$$;

CREATE FUNCTION public.verify_profile_pin(p_profile_id uuid, candidate_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  credential public.profile_pin_credentials%ROWTYPE;
  pin_matches boolean;
BEGIN
  IF NOT public.owns_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Profile not found or not owned by the current account.';
  END IF;

  SELECT * INTO credential
  FROM public.profile_pin_credentials
  WHERE profile_pin_credentials.profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF credential.locked_until IS NOT NULL AND credential.locked_until > now() THEN
    RETURN false;
  END IF;

  pin_matches := candidate_pin ~ '^[0-9]{4,6}$'
    AND credential.pin_hash = extensions.crypt(candidate_pin, credential.pin_hash);
  IF pin_matches THEN
    UPDATE public.profile_pin_credentials
    SET failed_attempts = 0, locked_until = NULL, updated_at = now()
    WHERE profile_pin_credentials.profile_id = p_profile_id;
    RETURN true;
  END IF;

  UPDATE public.profile_pin_credentials
  SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
      updated_at = now()
  WHERE profile_pin_credentials.profile_id = p_profile_id;
  RETURN false;
END;
$$;

CREATE FUNCTION public.clear_profile_pin(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Profile not found or not owned by the current account.';
  END IF;

  DELETE FROM public.profile_pin_credentials WHERE profile_pin_credentials.profile_id = p_profile_id;
  UPDATE public.profiles SET pin_enabled = false, updated_at = now() WHERE id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_profile_pin(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_profile_pin(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_profile_pin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.owns_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_profile_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_profile_pin(uuid) TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.age_icons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_icons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_age_icons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_quality_icons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slider_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_homepage_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_pin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_transfer_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE (first_name, last_name, marketing_consent) ON public.users TO authenticated;
GRANT SELECT, DELETE ON public.profiles TO authenticated;
GRANT INSERT (user_id, name, is_kids, avatar_url, sort_order, personalize_homepage, preferred_categories, preferred_genres)
  ON public.profiles TO authenticated;
GRANT UPDATE (name, is_kids, avatar_url, sort_order, personalize_homepage, preferred_categories, preferred_genres)
  ON public.profiles TO authenticated;
GRANT SELECT ON public.categories, public.contents, public.content_categories, public.age_icons, public.quality_icons TO anon, authenticated;
GRANT SELECT ON public.movies TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.movies TO authenticated;
GRANT SELECT ON public.genres TO anon, authenticated;
GRANT SELECT ON public.content_age_icons, public.content_quality_icons TO anon, authenticated;
GRANT SELECT ON public.collections, public.collection_items, public.homepage_sections, public.slider_content TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.profile_watchlist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_watch_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_homepage_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profile_settings TO authenticated;
GRANT SELECT ON public.profile_transfer_requests TO authenticated;
GRANT INSERT (source_profile_id, source_user_id, target_email, expires_at)
  ON public.profile_transfer_requests TO authenticated;
GRANT SELECT ON public.faq_items, public.legal_documents TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories, public.genres, public.contents, public.content_categories,
  public.age_icons, public.quality_icons, public.content_age_icons, public.content_quality_icons, public.collections,
  public.collection_items, public.homepage_sections, public.slider_content, public.faq_items, public.legal_documents
  TO authenticated;

CREATE POLICY users_read_own ON public.users
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY profiles_read_own ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY categories_public_read ON public.categories
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());
CREATE POLICY categories_admin_manage ON public.categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY genres_public_read ON public.genres
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());
CREATE POLICY genres_admin_manage ON public.genres
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY contents_public_read ON public.contents
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());
CREATE POLICY contents_admin_manage ON public.contents
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY movies_public_read ON public.movies
  FOR SELECT TO anon, authenticated USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.contents
      WHERE id = movies.id AND published
    )
  );
CREATE POLICY movies_admin_manage ON public.movies
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY age_icons_public_read ON public.age_icons
  FOR SELECT TO anon, authenticated USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.content_age_icons AS link
    JOIN public.contents AS content ON content.id = link.content_id
    WHERE link.age_icon_id = age_icons.id AND content.published
  ));
CREATE POLICY age_icons_admin_manage ON public.age_icons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY quality_icons_public_read ON public.quality_icons
  FOR SELECT TO anon, authenticated USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.content_quality_icons AS link
    JOIN public.contents AS content ON content.id = link.content_id
    WHERE link.quality_icon_id = quality_icons.id AND content.published
  ));
CREATE POLICY quality_icons_admin_manage ON public.quality_icons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY content_categories_public_read ON public.content_categories
  FOR SELECT TO anon, authenticated USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.contents AS content
    WHERE content.id = content_id AND content.published
  ));
CREATE POLICY content_categories_admin_manage ON public.content_categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY content_age_icons_public_read ON public.content_age_icons
  FOR SELECT TO anon, authenticated USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.contents
    WHERE id = content_id AND published
  ));
CREATE POLICY content_age_icons_admin_manage ON public.content_age_icons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY content_quality_icons_public_read ON public.content_quality_icons
  FOR SELECT TO anon, authenticated USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.contents
    WHERE id = content_id AND published
  ));
CREATE POLICY content_quality_icons_admin_manage ON public.content_quality_icons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY collections_public_read ON public.collections
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());
CREATE POLICY collections_admin_manage ON public.collections
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY collection_items_public_read ON public.collection_items
  FOR SELECT TO anon, authenticated USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.collections
    WHERE id = collection_id AND published
  ));
CREATE POLICY collection_items_admin_manage ON public.collection_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS homepage_sections_public_read ON public.homepage_sections;
CREATE POLICY homepage_sections_public_read ON public.homepage_sections
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());
DROP POLICY IF EXISTS homepage_sections_admin_manage ON public.homepage_sections;
CREATE POLICY homepage_sections_admin_manage ON public.homepage_sections
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY slider_content_public_read ON public.slider_content
  FOR SELECT TO anon, authenticated USING (
    public.is_admin()
    OR (
      published
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at > now())
    )
  );
CREATE POLICY slider_content_admin_manage ON public.slider_content
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY watchlist_profile_owner ON public.profile_watchlist
  FOR ALL TO authenticated USING (public.owns_profile(profile_id))
  WITH CHECK (public.owns_profile(profile_id));
CREATE POLICY watch_history_profile_owner ON public.profile_watch_history
  FOR ALL TO authenticated USING (public.owns_profile(profile_id))
  WITH CHECK (public.owns_profile(profile_id));
CREATE POLICY homepage_preferences_profile_owner ON public.profile_homepage_preferences
  FOR ALL TO authenticated USING (public.owns_profile(profile_id))
  WITH CHECK (public.owns_profile(profile_id));
CREATE POLICY profile_settings_owner_manage ON public.profile_settings
  FOR ALL TO authenticated USING (public.owns_profile(profile_id))
  WITH CHECK (public.owns_profile(profile_id));
CREATE POLICY transfer_source_or_target_read ON public.profile_transfer_requests
  FOR SELECT TO authenticated USING (
    source_user_id = (SELECT auth.uid()) OR target_user_id = (SELECT auth.uid())
  );
CREATE POLICY transfer_source_insert ON public.profile_transfer_requests
  FOR INSERT TO authenticated WITH CHECK (
    source_user_id = (SELECT auth.uid()) AND public.owns_profile(source_profile_id)
  );

CREATE POLICY faq_public_read ON public.faq_items
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());
CREATE POLICY faq_admin_manage ON public.faq_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY legal_documents_public_read ON public.legal_documents
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY legal_documents_admin_manage ON public.legal_documents
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.categories (slug, title, sort_order) VALUES
  ('anime', 'Anime', 0),
  ('cartoon', 'Çizgi Filmler', 1);

INSERT INTO public.genres (slug, title, image_url, sort_order)
SELECT DISTINCT ON (normalized.slug)
  normalized.slug,
  normalized.title,
  normalized.image_url,
  row_number() OVER (ORDER BY normalized.slug)::integer - 1
FROM (
  SELECT
    regexp_replace(translate(lower(btrim(content.genre)), 'çğıöşü', 'cgiosu'), '[^a-z0-9]+', '-', 'g') AS slug,
    btrim(content.genre) AS title,
    (
      SELECT related.poster_url
      FROM public.contents AS related
      WHERE lower(btrim(related.genre)) = lower(btrim(content.genre))
        AND related.poster_url IS NOT NULL
      ORDER BY related.sort_order, related.title
      LIMIT 1
    ) AS image_url
  FROM public.contents AS content
  WHERE nullif(btrim(content.genre), '') IS NOT NULL
) AS normalized
WHERE normalized.slug <> ''
ORDER BY normalized.slug, normalized.title;

INSERT INTO public.age_icons (code, label, minimum_age, description, sort_order) VALUES
  ('general', 'Genel İzleyici', 0, 'Her yaş için uygun.', 0),
  ('7-plus', '7+', 7, '7 yaş ve üzeri için.', 1),
  ('13-plus', '13+', 13, '13 yaş ve üzeri için.', 2),
  ('16-plus', '16+', 16, '16 yaş ve üzeri için.', 3),
  ('18-plus', '18+', 18, 'Yalnızca yetişkinler için.', 4);

INSERT INTO public.quality_icons (code, label, description, sort_order) VALUES
  ('hd', 'HD', 'Yüksek çözünürlüklü görüntü.', 0),
  ('full-hd', 'Full HD', '1920×1080 çözünürlük.', 1),
  ('4k', '4K', 'Ultra yüksek çözünürlüklü görüntü.', 2),
  ('hdr', 'HDR', 'Yüksek dinamik aralık desteği.', 3),
  ('dolby-audio', 'Dolby Audio', 'Dolby ses desteği.', 4);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('genre-images', 'genre-images', true, 10485760, ARRAY['image/*'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS genre_images_public_read ON storage.objects;
CREATE POLICY genre_images_public_read ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'genre-images');
DROP POLICY IF EXISTS genre_images_admin_insert ON storage.objects;
CREATE POLICY genre_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'genre-images' AND public.is_admin());
DROP POLICY IF EXISTS genre_images_admin_update ON storage.objects;
CREATE POLICY genre_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'genre-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'genre-images' AND public.is_admin());
DROP POLICY IF EXISTS genre_images_admin_delete ON storage.objects;
CREATE POLICY genre_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'genre-images' AND public.is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('movie-subtitles', 'movie-subtitles', true, 20971520, ARRAY['text/*', 'application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS movie_subtitles_public_read ON storage.objects;
CREATE POLICY movie_subtitles_public_read ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'movie-subtitles');
DROP POLICY IF EXISTS movie_subtitles_admin_insert ON storage.objects;
CREATE POLICY movie_subtitles_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'movie-subtitles' AND public.is_admin());
DROP POLICY IF EXISTS movie_subtitles_admin_update ON storage.objects;
CREATE POLICY movie_subtitles_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'movie-subtitles' AND public.is_admin())
  WITH CHECK (bucket_id = 'movie-subtitles' AND public.is_admin());
DROP POLICY IF EXISTS movie_subtitles_admin_delete ON storage.objects;
CREATE POLICY movie_subtitles_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'movie-subtitles' AND public.is_admin());

-- ===== account-email-exists.sql =====

CREATE OR REPLACE FUNCTION public.account_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = lower(btrim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.account_email_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_email_exists(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- ===== catalog-expansion.sql =====

ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS short_description text;

ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS content_type text;

ALTER TABLE public.contents
  DROP CONSTRAINT IF EXISTS contents_content_type_check,
  ADD CONSTRAINT contents_content_type_check
    CHECK (content_type IS NULL OR content_type IN ('movie', 'cartoon', 'anime'));

UPDATE public.contents AS content
SET content_type = 'movie'
WHERE content_type IS NULL
  AND EXISTS (SELECT 1 FROM public.movies AS movie WHERE movie.id = content.id);

CREATE INDEX IF NOT EXISTS contents_content_type_idx
  ON public.contents (content_type, sort_order, title);

CREATE TABLE IF NOT EXISTS public.content_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  season_number integer NOT NULL CHECK (season_number > 0),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description text,
  short_description text,
  poster_url text,
  poster_tv_url text,
  trailer_type text,
  trailer_url text,
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, season_number)
);

ALTER TABLE public.content_seasons
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS poster_tv_url text,
  ADD COLUMN IF NOT EXISTS trailer_type text,
  ADD COLUMN IF NOT EXISTS trailer_url text,
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.content_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.content_seasons(id) ON DELETE CASCADE,
  episode_number integer NOT NULL CHECK (episode_number > 0),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  short_description text,
  description text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  poster_url text,
  poster_tv_url text,
  skip_intro_start text,
  skip_intro_end text,
  outro_start text,
  outro_end text,
  imdb_rating numeric(3, 1) CHECK (imdb_rating IS NULL OR imdb_rating BETWEEN 0 AND 10),
  release_date date,
  content_rating text,
  video_upload_type text,
  quality_enabled boolean NOT NULL DEFAULT false,
  subtitle_enabled boolean NOT NULL DEFAULT false,
  watch_count integer NOT NULL DEFAULT 0 CHECK (watch_count >= 0),
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, episode_number),
  UNIQUE (id, season_id)
);

ALTER TABLE public.content_episodes
  ADD COLUMN IF NOT EXISTS poster_tv_url text,
  ADD COLUMN IF NOT EXISTS skip_intro_start text,
  ADD COLUMN IF NOT EXISTS skip_intro_end text,
  ADD COLUMN IF NOT EXISTS outro_start text,
  ADD COLUMN IF NOT EXISTS outro_end text,
  ADD COLUMN IF NOT EXISTS imdb_rating numeric(3, 1),
  ADD COLUMN IF NOT EXISTS release_date date,
  ADD COLUMN IF NOT EXISTS content_rating text,
  ADD COLUMN IF NOT EXISTS video_upload_type text,
  ADD COLUMN IF NOT EXISTS quality_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subtitle_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watch_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.profile_watch_history
  ADD CONSTRAINT profile_watch_history_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES public.content_episodes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.episode_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.content_episodes(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('source', 'subtitle', 'audio')),
  language_code text,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  url text NOT NULL,
  mime_type text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.episode_quality_icons (
  episode_id uuid NOT NULL REFERENCES public.content_episodes(id) ON DELETE CASCADE,
  quality_icon_id uuid NOT NULL REFERENCES public.quality_icons(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (episode_id, quality_icon_id)
);

CREATE TABLE IF NOT EXISTS public.platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  platform_type text NOT NULL DEFAULT 'catalog'
    CHECK (platform_type IN ('catalog', 'live_tv')),
  logo_url text,
  description text,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platforms
  ADD COLUMN IF NOT EXISTS background_image_url text,
  ADD COLUMN IF NOT EXISTS background_video_url text;

CREATE TABLE IF NOT EXISTS public.platform_contents (
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform_id, content_id)
);

CREATE TABLE IF NOT EXISTS public.platform_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text,
  logo_url text,
  background_image_url text,
  background_video_url text,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_collections_order_idx
  ON public.platform_collections (platform_id, published, sort_order);

CREATE TABLE IF NOT EXISTS public.platform_collection_contents (
  collection_id uuid NOT NULL REFERENCES public.platform_collections(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, content_id)
);

CREATE INDEX IF NOT EXISTS platform_collection_contents_order_idx
  ON public.platform_collection_contents (collection_id, sort_order);

CREATE TABLE IF NOT EXISTS public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text,
  avatar_url text,
  background_image_url text,
  background_video_url text,
  published boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  avatar_selectable boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_selectable boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.content_characters (
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, character_id)
);

CREATE INDEX IF NOT EXISTS content_characters_order_idx
  ON public.content_characters (content_id, sort_order);

CREATE TABLE IF NOT EXISTS public.tv_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  logo_url text,
  thumbnail_url text,
  stream_url text,
  description text,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_channels
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS stream_url text;

CREATE TABLE IF NOT EXISTS public.tv_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  episode_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (episode_id)
    REFERENCES public.content_episodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS content_seasons_order_idx
  ON public.content_seasons (content_id, sort_order, season_number);
CREATE INDEX IF NOT EXISTS content_episodes_order_idx
  ON public.content_episodes (season_id, sort_order, episode_number);
CREATE INDEX IF NOT EXISTS episode_media_assets_order_idx
  ON public.episode_media_assets (episode_id, asset_type, sort_order);
CREATE INDEX IF NOT EXISTS episode_quality_icons_order_idx
  ON public.episode_quality_icons (episode_id, sort_order);
CREATE INDEX IF NOT EXISTS platforms_public_order_idx
  ON public.platforms (published, platform_type, sort_order);
CREATE INDEX IF NOT EXISTS tv_channels_platform_order_idx
  ON public.tv_channels (platform_id, published, sort_order);
CREATE INDEX IF NOT EXISTS tv_schedule_airing_idx
  ON public.tv_schedule (channel_id, starts_at, ends_at);

CREATE OR REPLACE FUNCTION public.validate_platform_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platforms
    WHERE id = NEW.platform_id AND platform_type = 'catalog'
  ) THEN
    RAISE EXCEPTION 'İçerik yalnızca katalog türündeki platformlara bağlanabilir.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_tv_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  linked_content_id uuid;
  linked_platform_type text;
BEGIN
  SELECT platform.platform_type
  INTO linked_platform_type
  FROM public.tv_channels AS channel
  JOIN public.platforms AS platform ON platform.id = channel.platform_id
  WHERE channel.id = NEW.channel_id;

  IF linked_platform_type IS DISTINCT FROM 'live_tv' THEN
    RAISE EXCEPTION 'Yayın yalnızca canlı TV platformundaki kanala eklenebilir.';
  END IF;

  IF NEW.episode_id IS NOT NULL THEN
    SELECT season.content_id
    INTO linked_content_id
    FROM public.content_episodes AS episode
    JOIN public.content_seasons AS season ON season.id = episode.season_id
    WHERE episode.id = NEW.episode_id;

    IF linked_content_id IS DISTINCT FROM NEW.content_id THEN
      RAISE EXCEPTION 'Seçilen bölüm bu içerik kaydına ait değil.';
    END IF;
  END IF;

  IF NEW.published THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.channel_id::text)::bigint);
    IF EXISTS (
      SELECT 1
      FROM public.tv_schedule AS schedule
      WHERE schedule.channel_id = NEW.channel_id
        AND schedule.id <> NEW.id
        AND schedule.published
        AND schedule.starts_at < NEW.ends_at
        AND schedule.ends_at > NEW.starts_at
    ) THEN
      RAISE EXCEPTION 'Bu kanalda seçilen saat aralığıyla çakışan yayın var.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_platform_content ON public.platform_contents;
CREATE TRIGGER validate_platform_content
  BEFORE INSERT OR UPDATE ON public.platform_contents
  FOR EACH ROW EXECUTE FUNCTION public.validate_platform_content();

DROP TRIGGER IF EXISTS validate_tv_schedule ON public.tv_schedule;
CREATE TRIGGER validate_tv_schedule
  BEFORE INSERT OR UPDATE ON public.tv_schedule
  FOR EACH ROW EXECUTE FUNCTION public.validate_tv_schedule();

ALTER TABLE public.content_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_quality_icons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_collection_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_schedule ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.content_seasons, public.content_episodes, public.episode_media_assets, public.episode_quality_icons,
  public.platforms, public.platform_contents, public.platform_collections, public.characters,
  public.platform_collection_contents, public.content_characters, public.tv_channels, public.tv_schedule
  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.content_seasons, public.content_episodes,
  public.episode_media_assets, public.episode_quality_icons, public.platforms, public.platform_contents, public.platform_collections,
  public.platform_collection_contents, public.characters, public.content_characters,
  public.tv_channels, public.tv_schedule TO authenticated;
GRANT UPDATE (logo_url, short_description) ON public.contents TO authenticated;

DROP POLICY IF EXISTS content_seasons_public_read ON public.content_seasons;
CREATE POLICY content_seasons_public_read ON public.content_seasons
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.contents
      WHERE id = content_id AND published
    )
  );
DROP POLICY IF EXISTS content_seasons_admin_manage ON public.content_seasons;
CREATE POLICY content_seasons_admin_manage ON public.content_seasons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS content_episodes_public_read ON public.content_episodes;
CREATE POLICY content_episodes_public_read ON public.content_episodes
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1
      FROM public.content_seasons AS season
      JOIN public.contents AS content ON content.id = season.content_id
      WHERE season.id = content_episodes.season_id
        AND content.published
        AND content_episodes.published
    )
  );
DROP POLICY IF EXISTS content_episodes_admin_manage ON public.content_episodes;
CREATE POLICY content_episodes_admin_manage ON public.content_episodes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS episode_media_assets_public_read ON public.episode_media_assets;
CREATE POLICY episode_media_assets_public_read ON public.episode_media_assets
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1
      FROM public.content_episodes AS episode
      JOIN public.content_seasons AS season ON season.id = episode.season_id
      JOIN public.contents AS content ON content.id = season.content_id
      WHERE episode.id = episode_id AND episode.published AND content.published
    )
  );
DROP POLICY IF EXISTS episode_media_assets_admin_manage ON public.episode_media_assets;
CREATE POLICY episode_media_assets_admin_manage ON public.episode_media_assets
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

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

DROP POLICY IF EXISTS platforms_public_read ON public.platforms;
CREATE POLICY platforms_public_read ON public.platforms
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());
DROP POLICY IF EXISTS platforms_admin_manage ON public.platforms;
CREATE POLICY platforms_admin_manage ON public.platforms
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS platform_contents_public_read ON public.platform_contents;
CREATE POLICY platform_contents_public_read ON public.platform_contents
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1
      FROM public.platforms AS platform
      JOIN public.contents AS content ON content.id = content_id
      WHERE platform.id = platform_id AND platform.published AND content.published
    )
  );
DROP POLICY IF EXISTS platform_contents_admin_manage ON public.platform_contents;
CREATE POLICY platform_contents_admin_manage ON public.platform_contents
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS platform_collections_public_read ON public.platform_collections;
CREATE POLICY platform_collections_public_read ON public.platform_collections
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR (
      published AND EXISTS (
        SELECT 1 FROM public.platforms AS platform
        WHERE platform.id = platform_id AND platform.published
      )
    )
  );
DROP POLICY IF EXISTS platform_collections_admin_manage ON public.platform_collections;
CREATE POLICY platform_collections_admin_manage ON public.platform_collections
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS platform_collection_contents_public_read ON public.platform_collection_contents;
CREATE POLICY platform_collection_contents_public_read ON public.platform_collection_contents
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.platform_collections AS collection
      JOIN public.platforms AS platform ON platform.id = collection.platform_id
      JOIN public.contents AS content ON content.id = content_id
      WHERE collection.id = collection_id AND collection.published
        AND platform.published AND content.published
    )
  );
DROP POLICY IF EXISTS platform_collection_contents_admin_manage ON public.platform_collection_contents;
CREATE POLICY platform_collection_contents_admin_manage ON public.platform_collection_contents
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS characters_public_read ON public.characters;
CREATE POLICY characters_public_read ON public.characters
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());
DROP POLICY IF EXISTS characters_admin_manage ON public.characters;
CREATE POLICY characters_admin_manage ON public.characters
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

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

DROP POLICY IF EXISTS tv_channels_public_read ON public.tv_channels;
CREATE POLICY tv_channels_public_read ON public.tv_channels
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR (
      published AND EXISTS (
        SELECT 1 FROM public.platforms AS platform
        WHERE platform.id = platform_id
          AND platform.platform_type = 'live_tv'
          AND platform.published
      )
    )
  );
DROP POLICY IF EXISTS tv_channels_admin_manage ON public.tv_channels;
CREATE POLICY tv_channels_admin_manage ON public.tv_channels
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tv_schedule_public_read ON public.tv_schedule;
CREATE POLICY tv_schedule_public_read ON public.tv_schedule
  FOR SELECT TO anon, authenticated USING (
    public.is_admin() OR (
      published
      AND EXISTS (
        SELECT 1
        FROM public.tv_channels AS channel
        JOIN public.platforms AS platform ON platform.id = channel.platform_id
        JOIN public.contents AS content ON content.id = tv_schedule.content_id
        WHERE channel.id = channel_id
          AND channel.published
          AND platform.platform_type = 'live_tv'
          AND platform.published
          AND content.published
          AND (
            tv_schedule.episode_id IS NULL OR EXISTS (
              SELECT 1 FROM public.content_episodes AS episode
              WHERE episode.id = tv_schedule.episode_id AND episode.published
            )
          )
      )
    )
  );
DROP POLICY IF EXISTS tv_schedule_admin_manage ON public.tv_schedule;
CREATE POLICY tv_schedule_admin_manage ON public.tv_schedule
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('episode-assets', 'episode-assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS episode_assets_public_read ON storage.objects;
DROP POLICY IF EXISTS episode_assets_admin_insert ON storage.objects;
CREATE POLICY episode_assets_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'episode-assets' AND public.is_admin());
DROP POLICY IF EXISTS episode_assets_admin_update ON storage.objects;
CREATE POLICY episode_assets_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'episode-assets' AND public.is_admin())
  WITH CHECK (bucket_id = 'episode-assets' AND public.is_admin());
DROP POLICY IF EXISTS episode_assets_admin_delete ON storage.objects;
CREATE POLICY episode_assets_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'episode-assets' AND public.is_admin());

-- ===== catalog-browse-filters.sql =====

ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS production_origin text,
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS release_status text,
  ADD COLUMN IF NOT EXISTS platform_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS imdb_rating numeric(3, 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contents_production_origin_check'
      AND conrelid = 'public.contents'::regclass
  ) THEN
    ALTER TABLE public.contents
      ADD CONSTRAINT contents_production_origin_check
      CHECK (production_origin IS NULL OR production_origin IN ('turkish', 'foreign'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contents_release_status_check'
      AND conrelid = 'public.contents'::regclass
  ) THEN
    ALTER TABLE public.contents
      ADD CONSTRAINT contents_release_status_check
      CHECK (release_status IS NULL OR release_status IN ('ongoing', 'on_break', 'completed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contents_imdb_rating_check'
      AND conrelid = 'public.contents'::regclass
  ) THEN
    ALTER TABLE public.contents
      ADD CONSTRAINT contents_imdb_rating_check
      CHECK (imdb_rating IS NULL OR imdb_rating BETWEEN 0 AND 10);
  END IF;
END $$;

-- ===== genres.sql =====

CREATE TABLE IF NOT EXISTS public.genres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.genres ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.genres TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.genres TO authenticated;

DROP POLICY IF EXISTS genres_public_read ON public.genres;
CREATE POLICY genres_public_read ON public.genres
  FOR SELECT TO anon, authenticated USING (published OR public.is_admin());

DROP POLICY IF EXISTS genres_admin_manage ON public.genres;
CREATE POLICY genres_admin_manage ON public.genres
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('genre-images', 'genre-images', true, 10485760, ARRAY['image/*'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS genre_images_public_read ON storage.objects;
CREATE POLICY genre_images_public_read ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'genre-images');
DROP POLICY IF EXISTS genre_images_admin_insert ON storage.objects;
CREATE POLICY genre_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'genre-images' AND public.is_admin());
DROP POLICY IF EXISTS genre_images_admin_update ON storage.objects;
CREATE POLICY genre_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'genre-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'genre-images' AND public.is_admin());
DROP POLICY IF EXISTS genre_images_admin_delete ON storage.objects;
CREATE POLICY genre_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'genre-images' AND public.is_admin());

INSERT INTO public.genres (slug, title, image_url, sort_order)
SELECT DISTINCT ON (normalized.slug)
  normalized.slug,
  normalized.title,
  normalized.image_url,
  row_number() OVER (ORDER BY normalized.slug)::integer - 1
FROM (
  SELECT
    regexp_replace(translate(lower(btrim(content.genre)), 'çğıöşü', 'cgiosu'), '[^a-z0-9]+', '-', 'g') AS slug,
    btrim(content.genre) AS title,
    (
      SELECT related.poster_url
      FROM public.contents AS related
      WHERE lower(btrim(related.genre)) = lower(btrim(content.genre))
        AND related.poster_url IS NOT NULL
      ORDER BY related.sort_order, related.title
      LIMIT 1
    ) AS image_url
  FROM public.contents AS content
  WHERE nullif(btrim(content.genre), '') IS NOT NULL
) AS normalized
WHERE normalized.slug <> ''
ORDER BY normalized.slug, normalized.title
ON CONFLICT (slug) DO NOTHING;

-- ===== movies.sql =====

CREATE TABLE IF NOT EXISTS public.movies (
  id uuid PRIMARY KEY REFERENCES public.contents(id) ON DELETE CASCADE,
  actor text,
  director text,
  language text NOT NULL DEFAULT 'English',
  thumbnail_url text,
  poster_tv_url text,
  logo_url text,
  trailer_url text,
  trailer_type text,
  description text,
  release_date date,
  countries text[] NOT NULL DEFAULT '{}',
  imdb_rating numeric(3, 1) CHECK (imdb_rating IS NULL OR imdb_rating BETWEEN 0 AND 10),
  content_rating text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  skip_intro_start text,
  skip_intro_end text,
  download_enabled boolean NOT NULL DEFAULT true,
  video_upload_type text,
  video_url text,
  embed_code text,
  quality_enabled boolean NOT NULL DEFAULT false,
  qualities jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtitle_enabled boolean NOT NULL DEFAULT false,
  subtitles jsonb NOT NULL DEFAULT '[]'::jsonb,
  audio_tracks jsonb NOT NULL DEFAULT '[]'::jsonb,
  like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  watch_count integer NOT NULL DEFAULT 0 CHECK (watch_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS poster_tv_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS trailer_url text,
  ADD COLUMN IF NOT EXISTS trailer_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS release_date date,
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS imdb_rating numeric(3, 1),
  ADD COLUMN IF NOT EXISTS content_rating text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS skip_intro_start text,
  ADD COLUMN IF NOT EXISTS skip_intro_end text,
  ADD COLUMN IF NOT EXISTS download_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS video_upload_type text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS embed_code text,
  ADD COLUMN IF NOT EXISTS quality_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qualities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subtitle_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subtitles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audio_tracks jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.movies TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.movies TO authenticated;

DROP POLICY IF EXISTS movies_public_read ON public.movies;
DROP POLICY IF EXISTS movies_admin_manage ON public.movies;

CREATE POLICY movies_public_read ON public.movies
  FOR SELECT TO anon, authenticated USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.contents
      WHERE id = movies.id AND published
    )
  );

CREATE POLICY movies_admin_manage ON public.movies
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS movies_language_idx ON public.movies (language);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('movie-subtitles', 'movie-subtitles', true, 20971520, ARRAY['text/*', 'application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS movie_subtitles_public_read ON storage.objects;
CREATE POLICY movie_subtitles_public_read ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'movie-subtitles');
DROP POLICY IF EXISTS movie_subtitles_admin_insert ON storage.objects;
CREATE POLICY movie_subtitles_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'movie-subtitles' AND public.is_admin());
DROP POLICY IF EXISTS movie_subtitles_admin_update ON storage.objects;
CREATE POLICY movie_subtitles_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'movie-subtitles' AND public.is_admin())
  WITH CHECK (bucket_id = 'movie-subtitles' AND public.is_admin());
DROP POLICY IF EXISTS movie_subtitles_admin_delete ON storage.objects;
CREATE POLICY movie_subtitles_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'movie-subtitles' AND public.is_admin());

-- ===== sync-auth-users.sql =====

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    first_name,
    last_name,
    marketing_consent,
    marketing_consent_at,
    terms_accepted_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    COALESCE((NEW.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
    CASE
      WHEN COALESCE((NEW.raw_user_meta_data ->> 'marketing_consent')::boolean, false) THEN now()
      ELSE NULL
    END,
    NULLIF(NEW.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users
    SET email = NEW.email, updated_at = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_email_change();

INSERT INTO public.users (
  id,
  email,
  first_name,
  last_name,
  marketing_consent,
  marketing_consent_at,
  terms_accepted_at
)
SELECT
  account.id,
  account.email,
  COALESCE(account.raw_user_meta_data ->> 'first_name', ''),
  COALESCE(account.raw_user_meta_data ->> 'last_name', ''),
  COALESCE((account.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
  CASE
    WHEN COALESCE((account.raw_user_meta_data ->> 'marketing_consent')::boolean, false) THEN account.created_at
    ELSE NULL
  END,
  NULLIF(account.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz
FROM auth.users AS account
ON CONFLICT (id) DO NOTHING;

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

-- ===== storage-settings.sql =====

CREATE TABLE IF NOT EXISTS public.admin_storage_settings (
  provider text PRIMARY KEY CHECK (provider = 'backblaze'),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_storage_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_storage_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_storage_settings TO service_role;

-- ===== site-settings.sql =====

CREATE TABLE IF NOT EXISTS public.site_settings (
  id text PRIMARY KEY CHECK (id = 'global'),
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.site_settings TO service_role;

COMMIT;
