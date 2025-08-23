import { Injectable, OnModuleInit } from "@nestjs/common"
import { seeder } from "nestjs-seeder"
import { PairSeeder, ProfileSeeder, TokenSeeder } from "./data"
import { MongooseModule } from "../mongodb"

@Injectable()
export class SeedersService implements OnModuleInit {
    constructor() {}

    onModuleInit() {
        seeder({
            imports: [MongooseModule.forRoot()],
        }).run([
            TokenSeeder,
            PairSeeder,
            ProfileSeeder,
        ])
    }
}