"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const signUpAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  if (!email || !password) {
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email and password are required"
    );
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error(error.code + " " + error.message);
    return encodedRedirect("error", "/sign-up", error.message);
  } else {
    return encodedRedirect(
      "success",
      "/sign-up",
      "Thanks for signing up! Please check your email for a verification link."
    );
  }
};

export const signInAction = async () => {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInAnonymously();

  if (error) {
    return encodedRedirect("error", "/sign-in", error.message);
  }

  return redirect("/protected");
};

// export const signInAction = async (formData: FormData) => {
//   const email = formData.get("email") as string;
//   const password = formData.get("password") as string;
//   const supabase = await createClient();

//   const { error } = await supabase.auth.signInWithPassword({
//     email,
//     password,
//   });

//   if (error) {
//     return encodedRedirect("error", "/sign-in", error.message);
//   }

//   return redirect("/protected");
// };

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password"
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password."
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password and confirm password are required"
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Passwords do not match"
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password update failed"
    );
  }

  encodedRedirect("success", "/protected/reset-password", "Password updated");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};

function generateGameCode(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createGameAction(formData: FormData) {
  const supabase = await createClient();

  // Retrieve the authenticated user.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const playerName = formData.get("playerName") as string;
  const timerDuration = formData.get("timerDuration") as string;
  const gameCode = generateGameCode();

  // Create a new lobby.
  const { data: lobbyData, error: lobbyError } = await supabase
    .from("lobbies")
    .insert([
      {
        timer_duration: parseInt(timerDuration),
        status: "waiting",
        game_code: gameCode,
      },
    ])
    .select("*")
    .single();
  if (lobbyError) throw new Error(lobbyError.message);

  // Insert the host (creator) into the players table.
  // Let the DB generate the player's primary key.
  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .insert([
      {
        id: user.id, // use the user's ID as the player's ID
        lobby_id: lobbyData.id,
        name: playerName,
        join_order: 1,
        is_host: true,
        status: "active",
        profile_id: user.id, // link to the profiles table
      },
    ])
    .select("*")
    .single();
  if (playerError) throw new Error(playerError.message);

  // Redirect the user to the game board.
  redirect(`/protected/game-board?lobbyId=${lobbyData.id}`);
}

export async function joinGameAction(formData: FormData) {
  const supabase = await createClient();

  // Retrieve the authenticated user.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const gameCode = formData.get("gameCode") as string;
  const playerName = formData.get("playerName") as string;

  // Look up the lobby by game code.
  const { data: lobbyData, error: lobbyError } = await supabase
    .from("lobbies")
    .select("*")
    .eq("game_code", gameCode)
    .single();
  if (lobbyError || !lobbyData) throw new Error("Lobby not found");

  // Check if the user already exists in this lobby.
  const { data: existingPlayer, error: existingPlayerError } = await supabase
    .from("players")
    .select("*")
    .eq("lobby_id", lobbyData.id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (existingPlayerError) throw new Error(existingPlayerError.message);

  // If the player record already exists, simply redirect.
  if (existingPlayer) {
    redirect(
      `/protected/game-board?lobbyId=${lobbyData.id}&playerId=${existingPlayer.id}`
    );
    return;
  }

  // Count players in the lobby to set join_order.
  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("*")
    .eq("lobby_id", lobbyData.id);
  if (playersError) throw new Error(playersError.message);
  const joinOrder = (playersData?.length || 0) + 1;

  // Insert the new player into the players table.
  // Let the DB generate a unique primary key.
  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .insert([
      {
        id: user.id,
        lobby_id: lobbyData.id,
        name: playerName,
        join_order: joinOrder,
        is_host: false,
        status: "active",
        profile_id: user.id, // link to the profiles table if needed
      },
    ])
    .select("*")
    .single();
  if (playerError) throw new Error(playerError.message);

  redirect(
    `/protected/game-board?lobbyId=${lobbyData.id}&playerId=${playerData.id}`
  );
}

export async function submitWordAction(formData: FormData) {
  const supabase = await createClient();
  const roundId = formData.get("roundId") as string;
  const playerId = formData.get("playerId") as string;
  const word = formData.get("word") as string;

  // 1. Insert the submission.
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .insert([{ round_id: roundId, player_id: playerId, word }])
    .select("*")
    .single();
  if (submissionError) throw new Error(submissionError.message);

  // 2. Because of the trigger, the round's active_player_id and start_time have been updated.
  const { data: updatedRound, error: roundUpdateError } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .single();
  if (roundUpdateError) throw new Error(roundUpdateError.message);

  return { submission, updatedRound };
}

export async function disputeWordAction(formData: FormData) {
  const supabase = await createClient();
  const submissionId = formData.get("submissionId") as string;

  const { data, error } = await supabase
    .from("submissions")
    .update({ is_disputed: true })
    .eq("id", submissionId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function startRoundAction(formData: FormData) {
  const supabase = await createClient();
  const lobbyId = formData.get("lobbyId") as string;
  const startingPlayerId = formData.get("startingPlayerId") as string;
  const startingWord = formData.get("startingWord") as string;

  // get player id from session
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("profile_id", startingPlayerId)
    .single();
  if (playerError) throw new Error(playerError.message);

  // Determine the new round number.
  const { data: latestRound, error: roundError } = await supabase
    .from("rounds")
    .select("round_number")
    .eq("lobby_id", lobbyId)
    .order("round_number", { ascending: false })
    .limit(1)
    .single();
  if (roundError && roundError.code !== "PGRST116") {
    throw new Error(roundError.message);
  }
  const newRoundNumber = latestRound ? latestRound.round_number + 1 : 1;

  // Insert a new round record including active_player_id.
  const { data: newRound, error: insertError } = await supabase
    .from("rounds")
    .insert([
      {
        lobby_id: lobbyId,
        starting_player_id: startingPlayerId,
        active_player_id: startingPlayerId, // Set the active player initially.
        round_number: newRoundNumber,
        starting_word: startingWord,
        start_time: new Date().toISOString(), // Optionally set the start time.
      },
    ])
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);
  return newRound;
}

export async function eliminatePlayerAction(formData: FormData) {
  const supabase = await createClient();
  const playerId = formData.get("playerId") as string;
  const lobbyId = formData.get("lobbyId") as string;

  const { data, error } = await supabase
    .from("players")
    .update({ status: "eliminated" })
    .eq("id", playerId)
    .eq("lobby_id", lobbyId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function castVoteAction(formData: FormData) {
  const supabase = await createClient();
  const submissionId = formData.get("submissionId") as string;
  const playerId = formData.get("playerId") as string;
  const voteValue = formData.get("vote") as string; // "true" or "false"
  const vote = voteValue === "true";

  const { data, error } = await supabase
    .from("votes")
    .insert([{ submission_id: submissionId, player_id: playerId, vote }])
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function finalizeDisputeAction(formData: FormData) {
  const supabase = await createClient();
  const submissionId = formData.get("submissionId") as string;

  // Fetch all votes for this submission.
  const { data: votesData, error: votesError } = await supabase
    .from("votes")
    .select("vote");

  if (votesError) throw new Error(votesError.message);
  if (!votesData || votesData.length === 0)
    throw new Error("No votes found for this dispute");

  const acceptCount = votesData.filter((v: any) => v.vote === true).length;
  const declineCount = votesData.filter((v: any) => v.vote === false).length;
  const disputeResult = acceptCount > declineCount; // true if accepted

  // Update the disputed submission with the final result.
  const { data: submissionData, error: submissionError } = await supabase
    .from("submissions")
    .update({ dispute_result: disputeResult })
    .eq("id", submissionId)
    .select("*")
    .single();

  if (submissionError) throw new Error(submissionError.message);

  // If the dispute was rejected, eliminate the player who submitted the word.
  if (!disputeResult) {
    const submitterId = submissionData.player_id;
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .update({ status: "eliminated" })
      .eq("id", submitterId)
      .select("*")
      .single();
    if (playerError) throw new Error(playerError.message);
  }

  return { disputeResult, votesData };
}
