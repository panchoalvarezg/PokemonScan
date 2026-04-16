import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId es obligatorio' }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('user_cards_detailed')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'No se pudo cargar el inventario.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const {
      userId,
      pricechartingProductId,
      productName,
      setName,
      cardNumber,
      condition,
      quantity,
      estimatedUnitValue,
      imageUrl,
      notes,
      forTrade
    } = payload;

    if (!userId || !pricechartingProductId || !productName) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existingCard } = await supabase
      .from('card_catalog')
      .select('id')
      .eq('pricecharting_product_id', pricechartingProductId)
      .maybeSingle();

    let cardCatalogId = existingCard?.id;

    if (!cardCatalogId) {
      const { data: newCard, error: cardError } = await supabase
        .from('card_catalog')
        .insert({
          pricecharting_product_id: pricechartingProductId,
          product_name: productName,
          set_name: setName,
          card_number: cardNumber
        })
        .select('id')
        .single();

      if (cardError) throw cardError;
      cardCatalogId = newCard.id;
    }

    const { data, error } = await supabase
      .from('user_cards')
      .insert({
        user_id: userId,
        card_catalog_id: cardCatalogId,
        condition,
        quantity,
        estimated_unit_value: estimatedUnitValue,
        image_url: imageUrl,
        notes,
        for_trade: Boolean(forTrade)
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'No se pudo guardar la carta.' }, { status: 500 });
  }
}
