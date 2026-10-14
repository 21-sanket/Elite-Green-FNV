import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';
import { createHash } from 'crypto';

/**
 * GET /api/auth/pin
 * Returns list of active users with their role for the profile selector.
 *
 * POST /api/auth/pin
 * Verifies a 4-digit PIN for a user.
 * Body: { user_id: string, pin: string }
 */
export async function GET() {
  const supabase = await createServiceRoleClient();
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('active', true)
    .order('role');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: users || [] });
}

export async function POST(request: NextRequest) {
  try {
    const { user_id, pin } = await request.json();

    if (!user_id || !pin) {
      return NextResponse.json({ error: 'user_id and pin are required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    // Fetch user details
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('id', user_id)
      .eq('active', true)
      .single();

    if (userErr || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch pin hash
    const { data: pinRow, error: pinErr } = await supabase
      .from('user_pins')
      .select('pin_hash')
      .eq('user_id', user_id)
      .maybeSingle();

    if (pinErr || !pinRow) {
      return NextResponse.json({ error: 'PIN not configured for this user' }, { status: 400 });
    }

    const computedHash = createHash('sha256').update(pin.trim()).digest('hex');

    if (computedHash !== pinRow.pin_hash) {
      return NextResponse.json({ success: false, error: 'Incorrect PIN. Default is 1234.' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
