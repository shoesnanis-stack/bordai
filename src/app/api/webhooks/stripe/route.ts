import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // TODO: Verify Stripe webhook signature
  // TODO: Handle subscription events (checkout.session.completed, customer.subscription.updated, etc.)

  console.log('Stripe webhook received', { bodyLength: body.length })

  return NextResponse.json({ received: true })
}
