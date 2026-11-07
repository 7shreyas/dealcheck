import type { Report, ReportBlock } from "@/lib/types";
import CopyButton from "./CopyButton";
import styles from "./Flow.module.css";

function Block({ block }: { block: ReportBlock }) {
  switch (block.type) {
    case "p":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul className={styles.list}>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            {block.head.some(Boolean) && (
              <thead>
                <tr>
                  {block.head.map((h, i) => (
                    <th key={i} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "message":
      return (
        <div className={styles.message}>
          <p className={styles.messageLabel}>{block.label}</p>
          <p className={styles.messageText}>{block.text}</p>
          <CopyButton text={block.text} />
        </div>
      );
  }
}

export default function ReportView({ report }: { report: Report }) {
  return (
    <>
      {report.sections.map((section) => (
        <section key={section.id} id={section.id} className={`${styles.card} ${styles.section}`} aria-labelledby={`h-${section.id}`}>
          <h2 id={`h-${section.id}`} className={styles.h2}>
            {section.title}
          </h2>
          {section.body.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </section>
      ))}
    </>
  );
}
