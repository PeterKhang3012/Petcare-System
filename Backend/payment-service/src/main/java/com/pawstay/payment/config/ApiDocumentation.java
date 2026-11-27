package com.pawstay.payment.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class ApiDocumentation {
    @Bean
    OpenAPI paymentOpenApi() {
        return new OpenAPI()
                .info(new Info().title("PawStay Payment").version("1.0.0"))
                .servers(List.of(new Server().url("/")))
                .components(new Components().addSecuritySchemes("bearerAuth",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")));
    }

    @Bean
    OpenApiCustomizer paymentResponseDocumentation() {
        return document -> {
            var error = new ObjectSchema();
            error.addProperty("timestamp", new StringSchema().format("date-time"));
            error.addProperty("status", new IntegerSchema());
            error.addProperty("error", new StringSchema());
            error.addProperty("message", new StringSchema());
            error.addProperty("path", new StringSchema());
            error.setRequired(List.of("timestamp", "status", "error", "message", "path"));
            document.getComponents().addSchemas("PaymentError", error);

            var operations = List.of(
                    document.getPaths().get("/api/payments").getPost(),
                    document.getPaths().get("/api/payments/{paymentId}").getGet());
            for (var operation : operations) {
                var responses = operation.getResponses();
                responses.putIfAbsent("500", new ApiResponse().description("Internal payment error"));
                responses.forEach((status, response) -> {
                    if (status.matches("[45]..")) {
                        response.setContent(jsonContent(new Schema<>().$ref("#/components/schemas/PaymentError")));
                    } else if (status.matches("20[01]")) {
                        response.setContent(jsonContent(new Schema<>().$ref("#/components/schemas/PaymentResponse")));
                    }
                });
            }
            var browserReturn = document.getPaths().get("/api/payments/vnpay/return").getGet().getResponses();
            browserReturn.get("303").setContent(null);
            browserReturn.get("200").setContent(jsonContent(new ObjectSchema().addProperty("message", new StringSchema())));
        };
    }

    private static Content jsonContent(Schema<?> schema) {
        return new Content().addMediaType("application/json", new MediaType().schema(schema));
    }
}
