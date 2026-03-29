/**
 * useTransactionStatus — shared state for form submission + tx results.
 */
import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function useTransactionStatus() {
  const [status, setStatus] = useState<Status>("idle");
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStatus("idle");
    setTxSig(null);
    setError(null);
  };

  const startLoading = () => {
    setStatus("loading");
    setTxSig(null);
    setError(null);
  };

  const setSuccess = (signature: string) => {
    setTxSig(signature);
    setStatus("success");
    setError(null);
  };

  const setErrorMsg = (msg: string) => {
    setError(msg.slice(0, 120));
    setStatus("error");
  };

  return {
    status,
    txSig,
    error,
    isLoading: status === "loading",
    isSuccess: status === "success",
    isError: status === "error",
    reset,
    startLoading,
    setSuccess,
    setErrorMsg,
  };
}
