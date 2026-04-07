import { newMockEvent } from "matchstick-as"
import { ethereum, Address } from "@graphprotocol/graph-ts"
import {
  BasketCreated,
  OwnershipTransferred
} from "../generated/BasketFactory/BasketFactory"

export function createBasketCreatedEvent(
  creator: Address,
  vault: Address,
  shareToken: Address,
  name: string
): BasketCreated {
  let basketCreatedEvent = changetype<BasketCreated>(newMockEvent())

  basketCreatedEvent.parameters = new Array()

  basketCreatedEvent.parameters.push(
    new ethereum.EventParam("creator", ethereum.Value.fromAddress(creator))
  )
  basketCreatedEvent.parameters.push(
    new ethereum.EventParam("vault", ethereum.Value.fromAddress(vault))
  )
  basketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "shareToken",
      ethereum.Value.fromAddress(shareToken)
    )
  )
  basketCreatedEvent.parameters.push(
    new ethereum.EventParam("name", ethereum.Value.fromString(name))
  )

  return basketCreatedEvent
}

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent =
    changetype<OwnershipTransferred>(newMockEvent())

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}
