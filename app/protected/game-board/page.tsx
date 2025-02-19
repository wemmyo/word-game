// app/game-board/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { GameBoard } from "@/components/game-board";

export default async function GameBoardPage({
  searchParams,
}: {
  searchParams: { lobbyId: string };
}) {
  const { lobbyId } = searchParams;
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

  // Fetch lobby data (including game_code and timer_duration).
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

  // Use lobby's timer_duration as maxTime and initial timeLeft.
  const maxTime = lobbyData.timer_duration || 30;
  const timeLeft = maxTime;

  let currentPlayer = "";
  let currentWord = "";
  if (roundData) {
    const { data: submissionData } = await supabase
      .from("submissions")
      .select("player_id, created_at, word")
      .eq("round_id", roundData.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const activePlayers = players.filter((p) => !p.isEliminated);
    if (submissionData) {
      const submitterIndex = activePlayers.findIndex(
        (p) => p.id === submissionData.player_id
      );
      if (activePlayers.length > 0) {
        currentPlayer =
          activePlayers[(submitterIndex + 1) % activePlayers.length].id;
      }
    } else {
      currentPlayer = roundData.starting_player_id;
    }
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
    />
  );
}
