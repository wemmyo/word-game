"use client";

import { useState, useEffect, useMemo } from "react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  disputeWordAction,
  submitWordAction,
  startRoundAction,
  eliminatePlayerAction,
} from "@/app/actions";
import { createClient } from "@/utils/supabase/client";
import DisputeVotingModal from "./dispute-vote";
import { cn } from "@/lib/utils";

export type Player = {
  id: string;
  name: string;
  avatar: string;
  isEliminated: boolean;
  isHost: boolean;
  join_order: number;
};

export type GameBoardProps = {
  players: Player[];
  currentWord: string;
  timeLeft: number;
  maxTime: number;
  lobbyId: string;
  playerId: string;
  gameCode: string;
  currentPlayer: string;
  currentRoundId: string | null;
  roundStartTime: number | null;
};

export function GameBoard({
  players: initialPlayers,
  currentWord,
  timeLeft,
  maxTime,
  lobbyId,
  playerId,
  gameCode,
  currentPlayer: initialActivePlayer,
  currentRoundId: initialRoundId,
  roundStartTime: initialRoundStartTime,
}: GameBoardProps) {
  // Local states
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [localCurrentWord, setLocalCurrentWord] = useState(currentWord);
  const [newWord, setNewWord] = useState("");
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [latestSubmission, setLatestSubmission] = useState<any>(null);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(
    initialRoundId
  );
  const [roundStartTime, setRoundStartTime] = useState<number | null>(
    initialRoundStartTime
  );
  const [isTurnActive, setIsTurnActive] = useState(false);

  const [activeTimer, setActiveTimer] = useState<number>(timeLeft);
  const [eliminationTriggered, setEliminationTriggered] = useState(false);
  const [activePlayer, setActivePlayer] = useState<string>(initialActivePlayer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const supabase = useMemo(() => createClient(), []);

  // Helper: Generate a random word.
  function generateRandomWord() {
    const words = ["apple", "brave", "crane", "delta", "eagle"];
    return words[Math.floor(Math.random() * words.length)];
  }

  // --- Timer Effect ---
  useEffect(() => {
    if (!roundStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
      const remaining = maxTime - elapsed;
      setActiveTimer(remaining > 0 ? remaining : 0);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [roundStartTime, maxTime]);

  // --- Auto-Elimination & Auto-Round Restart ---
  useEffect(() => {
    if (roundStartTime && activeTimer === 0 && !eliminationTriggered) {
      setEliminationTriggered(true);
      const formData = new FormData();
      formData.append("playerId", activePlayer);
      formData.append("lobbyId", lobbyId);
      eliminatePlayerAction(formData)
        .then(() => {
          autoStartNextRound();
        })
        .catch((err) => console.error("Auto-elimination error:", err));
    }
  }, [
    activeTimer,
    eliminationTriggered,
    activePlayer,
    lobbyId,
    roundStartTime,
  ]);

  async function autoStartNextRound() {
    // Fetch the latest players list.
    const { data: playersData, error } = await supabase
      .from("players")
      .select("*")
      .eq("lobby_id", lobbyId);
    if (error) {
      console.error("Error fetching players:", error);
      return;
    }
    const updatedPlayers = playersData.map((p: any) => ({
      id: p.id,
      name: p.name,
      isEliminated: p.status === "eliminated",
      isHost: p.is_host,
      join_order: p.join_order,
      avatar: `/avatars/${p.id}.png`,
    }));
    setPlayers(updatedPlayers);
    const activePlayers = updatedPlayers
      .filter((p) => !p.isEliminated)
      .sort((a, b) => a.join_order - b.join_order);
    if (activePlayers.length === 0) {
      console.warn("No active players left");
      return;
    }
    const eliminatedPlayer = updatedPlayers.find((p) => p.id === activePlayer);
    let nextActivePlayer;
    if (eliminatedPlayer) {
      nextActivePlayer =
        activePlayers.find((p) => p.join_order > eliminatedPlayer.join_order) ||
        activePlayers[0];
    } else {
      nextActivePlayer = activePlayers[0];
    }
    const startingWord = generateRandomWord();
    const formData = new FormData();
    formData.append("lobbyId", lobbyId);
    formData.append("startingPlayerId", nextActivePlayer.id);
    formData.append("startingWord", startingWord);

    try {
      const newRound = await startRoundAction(formData);
      // Immediately update the round with the chosen active player.
      await supabase
        .from("rounds")
        .update({ active_player_id: nextActivePlayer.id })
        .eq("id", newRound.id);
      setCurrentRoundId(newRound.id);
      setRoundStartTime(
        newRound.start_time
          ? new Date(newRound.start_time).getTime()
          : Date.now()
      );
      setLatestSubmission(null);
      setLocalCurrentWord(newRound.starting_word);
      setActivePlayer(nextActivePlayer.id);
      setEliminationTriggered(false);
      // Activate turn after 1 second
      setTimeout(() => setIsTurnActive(true), 1000);
    } catch (error) {
      console.error("Auto start round error:", error);
    }
  }

  // --- Realtime Subscriptions ---
  useEffect(() => {
    if (!lobbyId) return;
    const roundsChannel = supabase
      .channel(`rounds:lobby_id=eq.${lobbyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rounds",
          filter: `lobby_id=eq.${lobbyId}`,
        },
        (payload) => {
          const newRound = payload.new;
          setCurrentRoundId(newRound.id);
          setLocalCurrentWord(newRound.starting_word);
          setRoundStartTime(
            newRound.start_time
              ? new Date(newRound.start_time).getTime()
              : Date.now()
          );
          if (newRound.active_player_id) {
            setActivePlayer(newRound.active_player_id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rounds",
          filter: `lobby_id=eq.${lobbyId}`,
        },
        (payload) => {
          const updatedRound = payload.new;
          if (updatedRound.start_time) {
            setRoundStartTime(new Date(updatedRound.start_time).getTime());
          }
          if (updatedRound.active_player_id) {
            setActivePlayer(updatedRound.active_player_id);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(roundsChannel);
    };
  }, [lobbyId, supabase]);

  useEffect(() => {
    if (!currentRoundId) return;
    const submissionChannel = supabase
      .channel(`submissions:round_id=eq.${currentRoundId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "submissions",
          filter: `round_id=eq.${currentRoundId}`,
        },
        (payload) => {
          setLatestSubmission(payload.new);
          setLocalCurrentWord(payload.new.word);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(submissionChannel);
    };
  }, [currentRoundId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`players:lobby_id=eq.${lobbyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "players",
          filter: `lobby_id=eq.${lobbyId}`,
        },
        (payload) => {
          setPlayers((prev) => [...prev, payload.new as Player]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          filter: `lobby_id=eq.${lobbyId}`,
        },
        (payload) => {
          setPlayers((prev) =>
            prev.map((player) =>
              player.id === payload.new.id
                ? {
                    ...player,
                    ...payload.new,
                    isEliminated: payload.new.status === "eliminated",
                  }
                : player
            )
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lobbyId, supabase]);

  // --- Word Submission Handler ---
  async function handleSubmitWord(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!currentRoundId) return;
    if (playerId !== activePlayer) return; // Not your turn.
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.append("playerId", playerId);
    formData.append("roundId", currentRoundId);
    try {
      // submitWordAction returns { submission, updatedRound }
      const { submission, updatedRound } = await submitWordAction(formData);
      setLatestSubmission(submission);
      setLocalCurrentWord(submission.word);
      setNewWord("");
      // Update active turn from the updated round record.
      setActivePlayer(updatedRound.active_player_id);
    } catch (error) {
      console.error("Submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // --- Dispute Voting Handler ---
  function handleDisputeClick() {
    setShowDisputeModal(true);
  }
  const canDispute =
    latestSubmission &&
    Date.now() - new Date(latestSubmission.created_at).getTime() <= 5000;

  // --- Manual Round Start Handler ---
  async function handleStartRound(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("lobbyId", lobbyId);
    // For manual start, use the current player's id.
    formData.append("startingPlayerId", playerId);
    try {
      const newRound = await startRoundAction(formData);
      setCurrentRoundId(newRound.id);
      // Fetch updated players list.
      const { data: playersData, error } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_id", lobbyId);
      if (error) console.error("Error fetching players:", error);
      const updatedPlayers = (playersData || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        isEliminated: p.status === "eliminated",
        isHost: p.is_host,
        join_order: p.join_order,
        avatar: `/avatars/${p.id}.png`,
      }));
      setPlayers(updatedPlayers);
      setRoundStartTime(
        newRound.start_time
          ? new Date(newRound.start_time).getTime()
          : Date.now()
      );
      setLatestSubmission(null);
      setLocalCurrentWord(newRound.starting_word);
      // For manual start, set active player to current player.
      setActivePlayer(playerId);
      setEliminationTriggered(false);
      // **Add this line to enable the turn immediately:**
      setIsTurnActive(true);
    } catch (error) {
      console.error("Start round error:", error);
    }
  }

  const currentUser = players.find((p) => p.id === playerId);
  const isCurrentUserEliminated = currentUser?.isEliminated || false;

  // --- Winning Condition ---
  useEffect(() => {
    const activePlayers = players.filter((p) => !p.isEliminated);
    if (players.length > 1 && activePlayers.length === 1) {
      setWinner(activePlayers[0].id);
    } else {
      setWinner(null);
    }
  }, [players]);

  return (
    <div className="flex flex-col space-y-6 w-full max-w-4xl mx-auto p-4">
      {winner && (
        <div className="p-4 bg-green-200 rounded text-center">
          {winner === playerId ? (
            <p>Congratulations! You are the winner!</p>
          ) : (
            <p>{players.find((p) => p.id === winner)?.name} is the winner!</p>
          )}
        </div>
      )}
      <div className="flex justify-between items-center">
        <div className="flex flex-col sm:flex-row items-center justify-between w-full">
          <h2 className="text-muted-foreground">
            Current Word:{" "}
            <span className="text-purple-600 text-3xl font-bold capitalize">
              {localCurrentWord || "No active round"}
            </span>
          </h2>
          <div className="flex items-center space-x-2">
            <Progress value={(activeTimer / maxTime) * 100} className="w-32" />
            <span>{activeTimer}s</span>
          </div>
        </div>
        <div className="p-2 bg-gray-200 rounded whitespace-nowrap ml-4">
          <Label>Game Code</Label>
          <p className="font-bold">{gameCode}</p>
        </div>
      </div>

      {/* Manual Round Start Form */}
      {!currentRoundId && (
        <>
          {isCurrentUserEliminated ? (
            <p className="text-center text-red-500">
              You have been eliminated and cannot start a new round.
            </p>
          ) : (
            <form
              onSubmit={handleStartRound}
              className="flex flex-col space-y-2"
            >
              <Label htmlFor="startingWord">
                Start New Round - Enter starting word:
              </Label>
              <Input
                id="startingWord"
                name="startingWord"
                placeholder="Enter starting word"
                required
              />
              <Button type="submit">Start Round</Button>
            </form>
          )}
        </>
      )}

      {/* Word Submission & Dispute Actions */}
      {currentRoundId && (
        <>
          {playerId !== activePlayer && (
            <p className="text-center text-gray-500">
              Please wait, it's not your turn.
            </p>
          )}
          <form onSubmit={handleSubmitWord} className="flex space-x-2">
            <div className="flex-grow">
              <Label htmlFor="newWord" className="sr-only">
                New Word
              </Label>
              <Input
                id="newWord"
                name="word"
                placeholder="Enter your word"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || playerId !== activePlayer}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={handleDisputeClick}
              disabled={!canDispute}
            >
              Dispute
            </Button>
          </form>
        </>
      )}

      {/* Players Display */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {players.map((player) => (
          <Card
            key={player.id}
            className={cn({
              "opacity-50": player.isEliminated,
              "border-purple-500 border-2": player.id === activePlayer,
            })}
          >
            <CardContent className="flex flex-col items-center p-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={player.avatar} alt={player.name} />
                <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <p className="mt-2 font-semibold">{player.name}</p>
              {player.isEliminated && (
                <p className="text-red-500">Eliminated</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dispute Voting Modal */}
      {showDisputeModal && latestSubmission && (
        <DisputeVotingModal
          submissionTime={latestSubmission.created_at}
          submissionId={latestSubmission.id}
          currentPlayerId={playerId}
          onFinalize={(result: boolean) => {
            console.log("Dispute finalized, result:", result);
          }}
          onClose={() => setShowDisputeModal(false)}
        />
      )}
    </div>
  );
}
