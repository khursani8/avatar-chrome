import styles from "./BootOverlay.module.css";

interface Props {
  llmReady: boolean;
  llmStatus: string;
  ttsReady: boolean;
  ttsStatus: string;
  ttsEnabled: boolean;
}

export function BootOverlay({ llmReady, llmStatus, ttsReady, ttsStatus, ttsEnabled }: Props) {
  const aiDone = llmReady || llmStatus === "unavailable" || llmStatus === "error";
  const ttsDone = !ttsEnabled || ttsReady || ttsStatus === "";
  const allDone = aiDone && ttsDone;

  if (allDone) return null;

  const steps = [
    {
      label: "Chrome AI",
      status: llmReady ? "done" : llmStatus === "downloading" ? "active" : "pending",
      detail: llmStatus === "downloading" ? "Downloading model..." : llmReady ? "Ready" : "Checking...",
    },
    {
      label: "Voice Engine",
      status: ttsReady ? "done" : ttsStatus ? "active" : "pending",
      detail: ttsReady ? "Ready" : ttsStatus || "Queued...",
    },
  ];

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.ringContainer}>
          <div className={styles.ring} />
          <div className={styles.ringInner}>
            <span className={styles.ringText}>AI</span>
          </div>
        </div>
        <div className={styles.steps}>
          {steps.map((step) => (
            <div key={step.label} className={styles.step}>
              <div className={`${styles.checkmark} ${styles[step.status]}`}>
                {step.status === "done" && "✓"}
                {step.status === "active" && <span className={styles.miniSpinner} />}
                {step.status === "pending" && "·"}
              </div>
              <div className={styles.stepInfo}>
                <span className={styles.stepLabel}>{step.label}</span>
                <span className={styles.stepDetail}>{step.detail}</span>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{
              width: `${steps.filter((s) => s.status === "done").length / steps.length * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
