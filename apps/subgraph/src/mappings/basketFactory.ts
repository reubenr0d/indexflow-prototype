import { BasketCreated } from "../../generated/BasketFactory/BasketFactory";
import { BasketVaultTemplate } from "../../generated/templates";
import { ensureVaultState, refreshBasketFromChain, syncBasketAssets } from "./helpers";

export function handleBasketCreated(event: BasketCreated): void {
  const basket = refreshBasketFromChain(event.params.vault, event);
  basket.creator = event.params.creator;
  basket.vault = event.params.vault;
  basket.shareToken = event.params.shareToken;
  basket.name = event.params.name;
  basket.createdAt = event.block.timestamp;
  basket.createdBlock = event.block.number;
  basket.updatedAt = event.block.timestamp;
  basket.updatedBlock = event.block.number;
  basket.save();

  const state = ensureVaultState(basket, event);
  state.save();

  syncBasketAssets(event.params.vault, event);
  BasketVaultTemplate.create(event.params.vault);
}
