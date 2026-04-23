-- Shot 15: canonicalize the representative content-page archetype.

UPDATE page_snapshots
SET page_type = 'content'
WHERE page_type = 'blog_article';

ALTER TABLE page_snapshots
  DROP CONSTRAINT IF EXISTS page_snapshots_page_type_check;

ALTER TABLE page_snapshots
  ADD CONSTRAINT page_snapshots_page_type_check
  CHECK (
    page_type IN (
      'homepage',
      'pricing',
      'product',
      'about',
      'services',
      'contact',
      'form',
      'content',
      'legal',
      'other'
    )
  );
