import {
  BasketCreated as BasketCreatedEvent,
  OwnershipTransferred as OwnershipTransferredEvent
} from "../generated/BasketFactory/BasketFactory"
import { BasketCreated, OwnershipTransferred } from "../generated/schema"

export function handleBasketCreated(event: BasketCreatedEvent): void {
  let entity = new BasketCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.creator = event.params.creator
  entity.vault = event.params.vault
  entity.shareToken = event.params.shareToken
  entity.name = event.params.name

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleOwnershipTransferred(
  event: OwnershipTransferredEvent
): void {
  let entity = new OwnershipTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousOwner = event.params.previousOwner
  entity.newOwner = event.params.newOwner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
