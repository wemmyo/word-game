import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { GameBoard } from "@/components/game-board";

export default async function GameBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ lobbyId: string }>;
}) {
  const { lobbyId } = await searchParams;
  const supabase = await createClient();

  // Retrieve the authenticated user.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }
  const playerId = user.id;

  // Fetch lobby data.
  const { data: lobbyData, error: lobbyError } = await supabase
    .from("lobbies")
    .select("game_code, timer_duration")
    .eq("id", lobbyId)
    .single();
  if (lobbyError || !lobbyData)
    throw new Error(lobbyError?.message || "Lobby not found");

  // Fetch players in the lobby.
  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, name, is_host, status, join_order")
    .eq("lobby_id", lobbyId)
    .order("join_order");
  if (playersError || !playersData)
    throw new Error(playersError?.message || "Players not found");

  const players = playersData.map((p: any) => ({
    id: p.id,
    name: p.name,
    isEliminated: p.status === "eliminated",
    isHost: p.is_host,
    join_order: p.join_order,
    avatar: `/avatars/${p.id}.png`,
  }));

  // Fetch the latest round (if any).
  const { data: roundData } = await supabase
    .from("rounds")
    .select("*")
    .eq("lobby_id", lobbyId)
    .order("round_number", { ascending: false })
    .limit(1)
    .single();

  const maxTime = lobbyData.timer_duration || 30;
  const timeLeft = maxTime;

  let currentPlayer = "";
  let currentWord = "";
  let currentRoundId: string | null = null;
  let persistedStartTime: number | null = null;
  if (roundData) {
    currentRoundId = roundData.id;
    // Use the persisted active_player_id (or fallback to starting_player_id)
    currentPlayer = roundData.active_player_id || roundData.starting_player_id;
    // Persist the start_time from the round record.
    persistedStartTime = roundData.start_time
      ? new Date(roundData.start_time).getTime()
      : null;
    // Fetch the latest submission (most recent) for the round.
    const { data: submissionData } = await supabase
      .from("submissions")
      .select("word")
      .eq("round_id", roundData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    currentWord = submissionData
      ? submissionData.word
      : roundData.starting_word;
  }

  return (
    <GameBoard
      players={players}
      currentWord={currentWord}
      timeLeft={timeLeft}
      maxTime={maxTime}
      lobbyId={lobbyId}
      playerId={playerId}
      gameCode={lobbyData.game_code}
      currentPlayer={currentPlayer}
      currentRoundId={currentRoundId}
      roundStartTime={persistedStartTime}
    />
  );
}
