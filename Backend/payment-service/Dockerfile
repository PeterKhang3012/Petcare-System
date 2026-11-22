FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml ./
COPY src/main ./src/main
RUN mvn -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/*.jar ./payment-service.jar
USER 10001:10001
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "/app/payment-service.jar"]
