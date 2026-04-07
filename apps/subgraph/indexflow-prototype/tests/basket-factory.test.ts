import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address } from "@graphprotocol/graph-ts"
import { BasketCreated } from "../generated/schema"
import { BasketCreated as BasketCreatedEvent } from "../generated/BasketFactory/BasketFactory"
import { handleBasketCreated } from "../src/basket-factory"
import { createBasketCreatedEvent } from "./basket-factory-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let creator = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let vault = Address.fromString("0x0000000000000000000000000000000000000001")
    let shareToken = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let name = "Example string value"
    let newBasketCreatedEvent = createBasketCreatedEvent(
      creator,
      vault,
      shareToken,
      name
    )
    handleBasketCreated(newBasketCreatedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("BasketCreated created and stored", () => {
    assert.entityCount("BasketCreated", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "BasketCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "creator",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "BasketCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "vault",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "BasketCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "shareToken",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "BasketCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "name",
      "Example string value"
    )

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  })
})
