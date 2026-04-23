-- Revert Shot 15 canonical content-page archetype constraint.

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
      'blog_article',
      'content',
      'legal',
      'other'
    )
  );
