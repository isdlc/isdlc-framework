package com.example.orders;

import java.util.List;
import java.math.BigDecimal;

/**
 * Order service for managing customer orders.
 */
public class OrderService {

    private final OrderRepository repository;
    private final PaymentGateway paymentGateway;

    public OrderService(OrderRepository repository, PaymentGateway paymentGateway) {
        this.repository = repository;
        this.paymentGateway = paymentGateway;
    }

    public Order createOrder(String customerId, List<LineItem> items) {
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("Order must have at least one item");
        }
        BigDecimal total = calculateTotal(items);
        Order order = new Order(customerId, items, total);
        return repository.save(order);
    }

    public Order getOrder(String orderId) {
        return repository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
    }

    public void cancelOrder(String orderId) {
        Order order = getOrder(orderId);
        if (order.getStatus() == OrderStatus.SHIPPED) {
            throw new IllegalStateException("Cannot cancel shipped order");
        }
        order.setStatus(OrderStatus.CANCELLED);
        repository.save(order);
    }

    private BigDecimal calculateTotal(List<LineItem> items) {
        return items.stream()
            .map(item -> item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Inner class for order validation.
     */
    public static class OrderValidator {
        public boolean validate(Order order) {
            return order != null
                && order.getCustomerId() != null
                && !order.getItems().isEmpty();
        }
    }
}

interface OrderRepository {
    Order save(Order order);
    java.util.Optional<Order> findById(String id);
}

class LineItem {
    private String productId;
    private BigDecimal price;
    private int quantity;

    public String getProductId() { return productId; }
    public BigDecimal getPrice() { return price; }
    public int getQuantity() { return quantity; }
}
