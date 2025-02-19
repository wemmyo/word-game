"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  timeLeft: number; // duration (in seconds) for each round timer
  maxTime: number; // maximum time per round (in seconds)
  lobbyId: string;
  playerId: string;
  gameCode: string;
  currentPlayer: string; // initial active player's turn (from server)
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
}: GameBoardProps) {
  // State for dispute modal.
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  // Local state for current word.
  const [localCurrentWord, setLocalCurrentWord] = useState(currentWord);
  const [newWord, setNewWord] = useState("");
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [latestSubmission, setLatestSubmission] = useState<any>(null);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  // Instead of storing the timer count directly, we store the common round start time.
  const [roundStartTime, setRoundStartTime] = useState<number | null>(null);
  // activeTimer is now computed based on roundStartTime.
  const [activeTimer, setActiveTimer] = useState<number>(timeLeft);
  const [eliminationTriggered, setEliminationTriggered] = useState(false);
  // Track active turn.
  const [activePlayer, setActivePlayer] = useState<string>(initialActivePlayer);
  const [roundStartingPlayer, setRoundStartingPlayer] = useState<string | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const supabase = useMemo(() => createClient(), []);

  // --- Realtime Timer Effect ---
  // When roundStartTime is set, compute the remaining time as:
  //   activeTimer = maxTime - floor((now - roundStartTime) / 1000)
  // and update every second.
  useEffect(() => {
    if (!roundStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
      const remaining = maxTime - elapsed;
      setActiveTimer(remaining > 0 ? remaining : 0);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [roundStartTime, maxTime]);

  // --- Realtime Subscription for Rounds (INSERT and UPDATE) ---
  // This subscription listens for new rounds and for updates (such as timer resets)
  // so that all clients share the same round start time.
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
          // Use the round's start_time if provided; otherwise, use now.
          if (newRound.start_time) {
            setRoundStartTime(new Date(newRound.start_time).getTime());
          } else {
            setRoundStartTime(Date.now());
          }
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
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(roundsChannel);
    };
  }, [lobbyId, supabase]);

  // --- Realtime Subscription for Submissions & Players ---
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

  // --- Recalculate Active Turn on New Submission ---
  useEffect(() => {
    const activePlayers = players
      .filter((p) => !p.isEliminated)
      .sort((a, b) => a.join_order - b.join_order);
    if (latestSubmission) {
      const submitterIndex = activePlayers.findIndex(
        (p) => p.id === latestSubmission.player_id
      );
      if (activePlayers.length > 0 && submitterIndex !== -1) {
        const nextIndex = (submitterIndex + 1) % activePlayers.length;
        setActivePlayer(activePlayers[nextIndex].id);
      }
    }
  }, [latestSubmission, players]);

  // --- Winning Condition ---
  const [winner, setWinner] = useState<string | null>(null);
  useEffect(() => {
    const activePlayers = players.filter((p) => !p.isEliminated);
    if (players.length > 1 && activePlayers.length === 1) {
      setWinner(activePlayers[0].id);
    } else {
      setWinner(null);
    }
  }, [players]);

  // --- Word Submission ---
  async function handleSubmitWord(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!currentRoundId) return;
    if (playerId !== activePlayer) return; // Not your turn.
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.append("playerId", playerId);
    formData.append("roundId", currentRoundId);
    try {
      const submission = await submitWordAction(formData);
      setLatestSubmission(submission);
      setLocalCurrentWord(submission.word);
      setNewWord("");
      // After a successful submission, update the round’s start time in the database.
      // This will trigger the realtime subscription and reset the timer for all players.
      await supabase
        .from("rounds")
        .update({ start_time: new Date().toISOString() })
        .eq("id", currentRoundId);
    } catch (error) {
      console.error("Submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // --- Dispute Voting ---
  function handleDisputeClick() {
    setShowDisputeModal(true);
  }

  // --- Start New Round ---
  async function handleStartRound(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isCurrentUserEliminated) return;
    const formData = new FormData(e.currentTarget);
    formData.append("lobbyId", lobbyId);
    formData.append("startingPlayerId", playerId);
    try {
      const newRound = await startRoundAction(formData);
      // Update local round state.
      setCurrentRoundId(newRound.id);
      // Refresh players from the database.
      const { data: playersData, error } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_id", lobbyId);
      if (error) {
        console.error("Error fetching players:", error);
      }
      const updatedPlayers = (playersData || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        isEliminated: p.status === "eliminated",
        isHost: p.is_host,
        join_order: p.join_order,
        avatar: `/avatars/${p.id}.png`,
      }));
      setPlayers(updatedPlayers);

      // Compute next active player (skip the starting player).
      const activePlayers = updatedPlayers
        .filter((p) => !p.isEliminated)
        .sort((a, b) => a.join_order - b.join_order);
      const startingIndex = activePlayers.findIndex(
        (p) => p.id === newRound.starting_player_id
      );
      let nextIndex = startingIndex + 1;
      if (nextIndex >= activePlayers.length) nextIndex = 0;
      const nextActivePlayer = activePlayers[nextIndex].id;
      // Update round's active_player_id so all clients get the update.
      await supabase
        .from("rounds")
        .update({ active_player_id: nextActivePlayer })
        .eq("id", newRound.id);
      // Assume newRound.start_time is set in the response.
      if (newRound.start_time) {
        setRoundStartTime(new Date(newRound.start_time).getTime());
      } else {
        setRoundStartTime(Date.now());
      }
      setLatestSubmission(null);
      setLocalCurrentWord(newRound.starting_word);
    } catch (error) {
      console.error("Start round error:", error);
    }
  }

  // --- Determine if Current User is Eliminated ---
  const currentUser = players.find((p) => p.id === playerId);
  const isCurrentUserEliminated = currentUser?.isEliminated || false;

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
          <h2 className="text-2xl font-bold">
            Current Word:{" "}
            <span className="text-purple-600">
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

      {/* Start round form (only for non-eliminated players) */}
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

      {/* Display players */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {players.map((player) => (
          <Card
            key={player.id}
            className={`${
              player.isEliminated ? "opacity-50" : ""
            } ${player.id === activePlayer ? "border-purple-500 border-2" : ""}`}
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

      {/* Word submission and dispute actions */}
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
                disabled={isSubmitting || playerId !== activePlayer}
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
            >
              Dispute
            </Button>
          </form>
        </>
      )}

      {/* Dispute voting modal */}
      {showDisputeModal && latestSubmission && (
        <DisputeVotingModal
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
