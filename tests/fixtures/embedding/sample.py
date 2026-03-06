"""
Order processing module for the e-commerce platform.
"""

from dataclasses import dataclass
from typing import List, Optional
from decimal import Decimal


@dataclass
class LineItem:
    product_id: str
    price: Decimal
    quantity: int


@dataclass
class Order:
    customer_id: str
    items: List[LineItem]
    total: Decimal
    status: str = "pending"


class OrderProcessor:
    """Processes and validates customer orders."""

    def __init__(self, tax_rate: Decimal = Decimal("0.08")):
        self.tax_rate = tax_rate

    def calculate_total(self, items: List[LineItem]) -> Decimal:
        """Calculate order total before tax."""
        return sum(item.price * item.quantity for item in items)

    def calculate_tax(self, subtotal: Decimal) -> Decimal:
        """Calculate tax for the given subtotal."""
        return subtotal * self.tax_rate

    def process_order(self, customer_id: str, items: List[LineItem]) -> Order:
        """Create and validate a new order."""
        if not items:
            raise ValueError("Order must have at least one item")

        subtotal = self.calculate_total(items)
        tax = self.calculate_tax(subtotal)
        total = subtotal + tax

        return Order(
            customer_id=customer_id,
            items=items,
            total=total,
        )


def find_order(orders: List[Order], order_id: str) -> Optional[Order]:
    """Find an order by ID from a list."""
    for order in orders:
        if hasattr(order, 'id') and order.id == order_id:
            return order
    return None


class DiscountCalculator:
    """Calculates discounts based on customer tier."""

    TIER_DISCOUNTS = {
        "bronze": Decimal("0.05"),
        "silver": Decimal("0.10"),
        "gold": Decimal("0.15"),
    }

    @classmethod
    def get_discount(cls, tier: str) -> Decimal:
        return cls.TIER_DISCOUNTS.get(tier.lower(), Decimal("0"))
