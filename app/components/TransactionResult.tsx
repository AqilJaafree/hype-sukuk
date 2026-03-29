/**
 * TransactionResult — displays success/error messages for tx submissions.
 */
interface Props {
  status: "idle" | "loading" | "success" | "error";
  txSig?: string | null;
  error?: string | null;
  successMessage?: string;
}

export default function TransactionResult({
  status,
  txSig,
  error,
  successMessage = "Transaction successful",
}: Props) {
  if (status === "success" && txSig) {
    return (
      <p className="text-sm text-forest text-center">
        {successMessage}.{" "}
        <a
          href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          View tx
        </a>
      </p>
    );
  }

  if (status === "error") {
    return (
      <p className="text-sm text-red text-center break-words">
        {error ?? "Transaction failed. Please try again."}
      </p>
    );
  }

  return null;
}
