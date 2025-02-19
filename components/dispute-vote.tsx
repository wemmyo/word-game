// components/dispute-vote.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { castVoteAction, finalizeDisputeAction } from "@/app/actions";

type DisputeVotingModalProps = {
  submissionId: string;
  currentPlayerId: string;
  onFinalize: (result: boolean) => void;
  onClose: () => void;
};

export default function DisputeVotingModal({
  submissionId,
  currentPlayerId,
  onFinalize,
  onClose,
}: DisputeVotingModalProps) {
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [vote, setVote] = useState<boolean | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [timer, setTimer] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!finalizing) finalizeVoting();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [finalizing]);

  async function handleVote(voteValue: boolean) {
    const formData = new FormData();
    formData.append("submissionId", submissionId);
    formData.append("playerId", currentPlayerId);
    formData.append("vote", voteValue.toString());
    try {
      await castVoteAction(formData);
      setVote(voteValue);
      setVoteSubmitted(true);
    } catch (error) {
      console.error("Vote error:", error);
    }
  }

  async function finalizeVoting() {
    setFinalizing(true);
    const formData = new FormData();
    formData.append("submissionId", submissionId);
    try {
      const result = await finalizeDisputeAction(formData);
      onFinalize(result.disputeResult);
      onClose();
    } catch (error) {
      console.error("Finalization error:", error);
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-80">
        <Label className="text-lg font-bold mb-2">Dispute Voting</Label>
        <p className="mb-4">Do you accept this word?</p>
        <div className="mb-4 text-center">
          <p className="text-sm text-gray-600">
            Auto-finalizing in {timer}s...
          </p>
        </div>
        <div className="flex justify-between mb-4">
          <Button onClick={() => handleVote(true)} disabled={voteSubmitted}>
            Accept
          </Button>
          <Button onClick={() => handleVote(false)} disabled={voteSubmitted}>
            Decline
          </Button>
        </div>
        {voteSubmitted && (
          <p className="mb-4">
            You voted: <strong>{vote ? "Accept" : "Decline"}</strong>
          </p>
        )}
        <div className="flex justify-end space-x-2">
          <Button onClick={finalizeVoting} disabled={finalizing}>
            Finalize Vote
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
