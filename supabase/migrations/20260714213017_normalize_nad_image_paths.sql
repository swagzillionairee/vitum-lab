-- Avoid environment-specific handling of literal/encoded plus signs in static
-- asset paths. Preserve every other field and variant ordering.
update public.products as p
set variants = (
      select jsonb_agg(
        case
          when variant.value ->> 'cart_code' = 'nad-500mg'
            then jsonb_set(
              variant.value,
              '{image_url}',
              to_jsonb('/NAD-500MG-PRODUCT-PIC.png'::text),
              true
            )
          else variant.value
        end
        order by variant.ordinality
      )
      from jsonb_array_elements(p.variants) with ordinality as variant(value, ordinality)
    ),
    updated_at = now()
where p.slug = 'nad';
