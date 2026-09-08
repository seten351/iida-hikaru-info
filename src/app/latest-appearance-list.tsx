import {
  type AppearanceCard,
  categoryClassNames,
  formatPublication,
} from "@/lib/appearances";

type LatestAppearanceListProps = {
  items: AppearanceCard[];
};

export function LatestAppearanceList({ items }: LatestAppearanceListProps) {
  return (
    <ol className="latest-appearance-list" aria-label="新着情報一覧">
      {items.map((item) => {
        const hasMultipleSources = item.sourceUrls.length > 1;
        const publicationDateTime =
          item.publication.publishedAt ?? item.publication.publishedOn;

        return (
          <li key={item.id}>
            <article className="latest-appearance">
              <div className="latest-appearance__body">
                <div className="latest-appearance__meta">
                  <span
                    className={`category-badge ${categoryClassNames[item.category]}`}
                  >
                    {item.category}
                  </span>
                  <p>
                    公開 {publicationDateTime ? (
                      <time dateTime={publicationDateTime}>
                        {formatPublication(item.publication)}
                      </time>
                    ) : (
                      formatPublication(item.publication)
                    )}
                  </p>
                </div>
                <h3>{item.title}</h3>
              </div>
              <div className="latest-appearance__sources" aria-label={`${item.title}の公式情報元`}>
                {item.sourceUrls.map((sourceUrl, index) => (
                  <a
                    className="source-link"
                    href={sourceUrl}
                    key={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${item.title}の情報元${index + 1}を新しいタブで開く`}
                  >
                    {hasMultipleSources ? `情報元 ${index + 1}` : "情報元を見る"}{" "}
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
